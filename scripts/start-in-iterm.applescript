set appPath to POSIX path of (path to me)
set projectDir to do shell script ("dirname " & quoted form of appPath)
set startCommand to "cd " & quoted form of projectDir & " && npm run start"

tell application "iTerm"
  activate
  set newWindow to (create window with default profile)
  tell current session of newWindow
    write text startCommand
  end tell
end tell
