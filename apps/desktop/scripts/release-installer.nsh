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

!macro easyworkValidateTarget
  !ifdef BUILD_UNINSTALLER
    ; initMultiUser may reset INSTDIR after the first check in un.onInit.
    ${if} $EasyWorkCheckedDirectory != ""
    ${andIf} $EasyWorkCheckedDirectory != $INSTDIR
      MessageBox MB_OK|MB_ICONSTOP "EasyWork uninstall target changed. Installation stopped."
      SetErrorLevel 2
      Quit
    ${endif}
    ReadEnvStr $R8 EASYWORK_NSIS_UNINSTALL_DIRECTORY
    ${if} $R8 != ""
    ${andIf} $R8 != $INSTDIR
      MessageBox MB_OK|MB_ICONSTOP "EasyWork uninstall target does not match the requested installation."
      SetErrorLevel 2
      Quit
    ${endif}
  !else
    ${if} ${isUpdated}
      ReadEnvStr $R8 EASYWORK_UPDATE_INSTALL_DIRECTORY
      ${if} $R8 == ""
      ${orIf} $R8 != $INSTDIR
        MessageBox MB_OK|MB_ICONSTOP "EasyWork update target does not match the running application."
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
    MessageBox MB_OK|MB_ICONSTOP "Cannot confirm that EasyWork at $INSTDIR has stopped. Close its tasks and windows, then run Setup again. No processes were terminated."
    SetErrorLevel 2
    Quit
  ${endif}
!macroend

!macro customUnInit
  !insertmacro customCheckAppRunning
!macroend

!macro customRemoveFiles
  !insertmacro customCheckAppRunning
  SetOutPath $TEMP
  ClearErrors
  RMDir /r "$INSTDIR"
  ${if} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "EasyWork replacement failed. Close EasyWork and run the complete Setup again to repair it. Automatic rollback is not available."
    SetErrorLevel 2
    Quit
  ${endif}
!macroend
