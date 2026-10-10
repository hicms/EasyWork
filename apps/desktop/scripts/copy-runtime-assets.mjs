import { chmodSync, closeSync, copyFileSync, cpSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, relative, resolve } from 'node:path'

function metadata(path) {
  try { return lstatSync(path, { bigint: true }) }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}

function signature(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mode, stat.mtimeNs, stat.ctimeNs].join(':')
}

function equalFiles(source, destination, size, sourceBuffer, destinationBuffer) {
  const sourceFd = openSync(source, 'r')
  let destinationFd
  try {
    destinationFd = openSync(destination, 'r')
    for (let position = 0; position < size;) {
      const length = Math.min(sourceBuffer.length, size - position)
      const sourceRead = readSync(sourceFd, sourceBuffer, 0, length, position)
      const destinationRead = readSync(destinationFd, destinationBuffer, 0, length, position)
      if (sourceRead !== length || destinationRead !== length
        || !sourceBuffer.subarray(0, length).equals(destinationBuffer.subarray(0, length))) return false
      position += length
    }
    return true
  } finally {
    closeSync(sourceFd)
    if (destinationFd !== undefined) closeSync(destinationFd)
  }
}

/** Merge trusted release assets into the build tree without rewriting identical bytes. */
export function copyRuntimeAssets(source, destination, receiptPath) {
  source = resolve(source)
  destination = resolve(destination)
  let previousText = ''
  let previous
  try { previousText = readFileSync(receiptPath, 'utf8'); previous = JSON.parse(previousText) }
  catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error }
  const files = previous?.version === 1 && previous.source === source && previous.destination === destination
    ? previous.files ?? {} : {}
  const nextFiles = {}
  const result = { copiedFiles: 0, copiedBytes: 0, unchangedFiles: 0, copiedLinks: 0, reusedChecks: 0 }
  const sourceBuffer = Buffer.allocUnsafe(64 * 1024)
  const destinationBuffer = Buffer.allocUnsafe(sourceBuffer.length)

  function copy(from, to) {
    const original = lstatSync(from, { bigint: true })
    const installed = metadata(to)
    if (original.isSymbolicLink()) {
      if (installed?.isSymbolicLink() && readlinkSync(from) === readlinkSync(to)) return
      if (installed) rmSync(to, { recursive: true, force: true })
      cpSync(from, to, { dereference: false, verbatimSymlinks: true })
      result.copiedLinks++
    } else if (original.isDirectory()) {
      // Never traverse a destination link when repairing a generated build tree.
      if (installed && !installed.isDirectory()) rmSync(to, { force: true })
      mkdirSync(to, { recursive: true })
      for (const entry of readdirSync(from).sort()) copy(join(from, entry), join(to, entry))
      if (process.platform !== 'win32' && (metadata(to).mode & 0o777n) !== (original.mode & 0o777n)) chmodSync(to, Number(original.mode & 0o777n))
    } else if (original.isFile()) {
      const key = relative(source, from).replaceAll('\\', '/')
      const sourceStamp = signature(original)
      const destinationStamp = installed?.isFile() ? signature(installed) : undefined
      const saved = files[key]
      if (installed?.isFile() && saved?.source === sourceStamp && saved.destination === destinationStamp) {
        nextFiles[key] = saved
        result.unchangedFiles++
        result.reusedChecks++
        return
      }
      const same = installed?.isFile() && installed.size === original.size
        && equalFiles(from, to, Number(original.size), sourceBuffer, destinationBuffer)
      // A file modified during comparison must be checked again on the next run.
      const stableComparison = same && signature(metadata(from)) === sourceStamp
        && signature(metadata(to)) === destinationStamp
      if (same) result.unchangedFiles++
      else {
        if (installed && !installed.isFile()) rmSync(to, { recursive: true, force: true })
        copyFileSync(from, to)
        result.copiedFiles++
        result.copiedBytes += Number(original.size)
      }
      let verifiedDestinationStamp = same ? destinationStamp : signature(metadata(to))
      if (process.platform !== 'win32' && (metadata(to).mode & 0o777n) !== (original.mode & 0o777n)) {
        chmodSync(to, Number(original.mode & 0o777n))
        verifiedDestinationStamp = signature(metadata(to))
      }
      const sourceAfter = metadata(from), destinationAfter = metadata(to)
      if ((!same || stableComparison) && signature(sourceAfter) === sourceStamp
        && destinationAfter.isFile() && signature(destinationAfter) === verifiedDestinationStamp) {
        nextFiles[key] = { source: sourceStamp, destination: signature(destinationAfter) }
      }
    } else {
      throw new Error(`Unsupported runtime asset: ${from}`)
    }
  }

  copy(source, destination)
  const nextText = JSON.stringify({ version: 1, source, destination, files: nextFiles }) + '\n'
  if (nextText !== previousText) {
    const temporary = `${receiptPath}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, nextText, { flag: 'wx' })
      renameSync(temporary, receiptPath)
    } finally { rmSync(temporary, { force: true }) }
  }
  return result
}
