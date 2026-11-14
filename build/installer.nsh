; Included by electron-builder in the launcher's installer and uninstaller (package.json, nsis.include).

; Before the launcher's files go, the launcher itself is run to offer removing the server it installed from nothing: it asks, stops the
; servers, keeps a last backup in Documents and deletes the server's folder. Never on an update (the old version is uninstalled silently
; then) nor on a silent uninstall: nobody would be asked.
!macro customUnInstall
  ${IfNot} ${isUpdated}
  ${AndIfNot} ${Silent}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --uninstall-server'
  ${EndIf}
!macroend
