set scriptPath to POSIX path of (path to me)
set scriptsDir to do shell script ("dirname " & quoted form of scriptPath)
set projectDir to do shell script ("dirname " & quoted form of scriptsDir)
set launchCommand to "cd " & quoted form of projectDir & " && npm run start"

tell application "iTerm"
  activate
  create window with default profile
  tell current window
    tell current session
      write text launchCommand
    end tell
  end tell
end tell
