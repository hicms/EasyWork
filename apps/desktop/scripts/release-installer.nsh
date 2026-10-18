; Shared safety checks for signed releases and unsigned acceptance installers.
!if ${NSIS_MAX_STRLEN} < 8192
  !error "EasyWork installer requires NSIS with 8192-character strings"
!endif
!if "$%EASYWORK_NSIS_7ZA%" == ""
  !error "EasyWork installer requires the checksum-locked 7za extractor"
!endif
!define EASYWORK_NSIS_7ZA "$%EASYWORK_NSIS_7ZA%"
!if "$%EASYWORK_NSIS_PROCESS_CHECK%" == ""
  !error "EasyWork installer requires its target process check"
!endif
!define EASYWORK_SAFE_INSTALL
!define EASYWORK_NSIS_PROCESS_CHECK "$%EASYWORK_NSIS_PROCESS_CHECK%"
Var EasyWorkCheckedDirectory
!ifndef BUILD_UNINSTALLER
  Var EasyWorkUpdateBanner
!endif

!macro customInit
  ; Every installer instance, including elevated ones, must release the old
  ; directory before the fresh uninstaller removes it. installSection restores it.
  SetOutPath $TEMP
  ; The carrier has already quit, so a silent update would otherwise show nothing until
  ; relaunch. An elevated inner instance runs while the outer one keeps its window.
  ${if} ${isUpdated}
  ${andIf} ${Silent}
  ${AndIfNot} ${UAC_IsInnerInstance}
    ReadEnvStr $R8 EASYWORK_UPDATE_LANGUAGE
    ; The stock banner dialog clips longer second lines.
    ${if} $R8 == "en"
      Banner::show /set 76 "Updating EasyWork" "It reopens when done."
    ${else}
      Banner::show /set 76 "正在更新 EasyWork" "完成后将自动重新打开，请稍候"
    ${endif}
    ; Stay above other windows without taking focus (SWP_NOSIZE|SWP_NOMOVE|SWP_NOACTIVATE).
    Banner::getWindow
    Pop $R8
    System::Call 'user32::SetWindowPos(p R8, p -1, i 0, i 0, i 0, i 0, i 0x13)'
    StrCpy $EasyWorkUpdateBanner 1
  ${endif}
!macroend

!macro customInstall
  ; Files, registry and shortcuts are complete; the relaunched window replaces this notice.
  ${if} $EasyWorkUpdateBanner == 1
    Banner::destroy
    StrCpy $EasyWorkUpdateBanner ""
  ${endif}
!macroend

!macro easyworkValidateTarget
  !ifdef BUILD_UNINSTALLER
    ; initMultiUser may reset INSTDIR after the first check in un.onInit.
    ${if} $EasyWorkCheckedDirectory != ""
    ${andIf} $EasyWorkCheckedDirectory != $INSTDIR
      MessageBox MB_OK|MB_ICONSTOP "EasyWork uninstall target changed. Installation stopped." /SD IDOK
      SetErrorLevel 2
      Quit
    ${endif}
    ReadEnvStr $R8 EASYWORK_NSIS_UNINSTALL_DIRECTORY
    ${if} $R8 != ""
    ${andIf} $R8 != $INSTDIR
      MessageBox MB_OK|MB_ICONSTOP "EasyWork uninstall target does not match the requested installation." /SD IDOK
      SetErrorLevel 2
      Quit
    ${endif}
  !else
    ${if} ${isUpdated}
      ReadEnvStr $R8 EASYWORK_UPDATE_INSTALL_DIRECTORY
      ${if} $R8 == ""
      ${orIf} $R8 != $INSTDIR
        MessageBox MB_OK|MB_ICONSTOP "EasyWork update target does not match the running application." /SD IDOK
        SetErrorLevel 2
        Quit
      ${endif}
    ${endif}
  !endif
  StrCpy $EasyWorkCheckedDirectory $INSTDIR
!macroend

!macro customCheckAppRunning
  !insertmacro easyworkValidateTarget
  ; Pass the path as data. Quotes/apostrophes in installation paths are not code.
  System::Call 'kernel32::SetEnvironmentVariable(t "EASYWORK_INSTALL_TARGET", t "$INSTDIR\${APP_EXECUTABLE_FILENAME}") i.r0'
  ${if} $0 == 0
    SetErrorLevel 2
    Quit
  ${endif}
  nsExec::Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -EncodedCommand ${EASYWORK_NSIS_PROCESS_CHECK}'
  Pop $R0
  System::Call 'kernel32::SetEnvironmentVariable(t "EASYWORK_INSTALL_TARGET", p 0)'
  ${if} $R0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Cannot confirm that EasyWork at $INSTDIR has stopped. Close its tasks and windows, then run Setup again. No processes were terminated." /SD IDOK
    SetErrorLevel 2
    Quit
  ${endif}
!macroend

!macro customUnInit
  !insertmacro customCheckAppRunning
!macroend

!macro easyworkCheckUninstallResult
  ${if} ${Errors}
  ${orIf} $R0 != 0
    MessageBox MB_OK|MB_ICONSTOP "EasyWork could not remove the previous installation. Run the complete Setup again to repair it." /SD IDOK
    SetErrorLevel 2
    Quit
  ${endif}
!macroend

!macro customUnInstallCheck
  !insertmacro easyworkCheckUninstallResult
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro easyworkCheckUninstallResult
!macroend

!macro customRemoveFiles
  !insertmacro customCheckAppRunning
  SetOutPath $TEMP
  ClearErrors
  RMDir /r "$INSTDIR"
  ${if} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "EasyWork replacement failed. Close EasyWork and run the complete Setup again to repair it. Automatic rollback is not available." /SD IDOK
    SetErrorLevel 2
    Quit
  ${endif}
!macroend
