# Upload malware scanner

CDS Space performs signature checks, real-format validation, image reconstruction,
PDF active-content checks, and ZIP traversal/decompression-bomb inspection inside
the application. A ClamAV daemon adds continuously updated malware signatures as
the final independent scanner.

Run `clamd` on a private network that the application can reach. Never publish
port 3310 to the public internet. The application streams bytes using ClamAV's
`INSTREAM` protocol, so storage paths and credentials are never sent to the
scanner.

Configure these server-only deployment values:

```dotenv
CLAMAV_HOST=clamav.internal
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_MS=20000
UPLOAD_MALWARE_SCAN_MODE=required
```

For a Unix socket, set `CLAMAV_SOCKET` instead of host and port. In production,
use `required`; a timeout, unavailable daemon, malformed response, or detection
then fails closed before object storage or database metadata is written.

`UPLOAD_BLOCKED_SHA256` can contain comma- or whitespace-separated SHA-256
hashes for an emergency denylist. Do not place file contents, private paths, or
credentials in that variable.

The included Compose file is suitable for a private scanner host. Wait for the
health check and initial signature download before enabling required mode.

