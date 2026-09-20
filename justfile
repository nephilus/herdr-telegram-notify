# No dependency installation, service, credentials, or external network needed.
check:
    node --test "{{justfile_directory()}}/notify.test.mjs"

# User-wide registration, including all running and future Herdr sessions.
install:
    herdr plugin link "{{justfile_directory()}}" --enabled

status:
    herdr plugin action invoke nephilus.telegram-notify.status

# Explicit publication to the configured private chat.
send-test:
    herdr plugin action invoke nephilus.telegram-notify.test

logs:
    herdr plugin log list --plugin nephilus.telegram-notify --limit 10

disable:
    herdr plugin disable nephilus.telegram-notify
