/** Install native optional dependencies for both the build host and packaged target. */
export function runtimeArchitecture(env=process.env,platform=process.platform,hostArch=process.arch){
 const targetArch=platform==='darwin'?(env.WORKDSH_MAC_ARCH??hostArch):hostArch;
 if(!['x64','arm64'].includes(targetArch))throw Error('Unsupported packaged runtime architecture: '+targetArch);
 return {platform,hostArch,targetArch,cpus:[...new Set([hostArch,targetArch])]};
}
export function runtimeArchitectureYaml(architecture){
 return 'supportedArchitectures:\n  os:\n    - '+architecture.platform+'\n  cpu:\n'+architecture.cpus.map(cpu=>'    - '+cpu+'\n').join('');
}
