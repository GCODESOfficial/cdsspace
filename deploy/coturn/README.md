# CMeet relay configuration

CMeet uses Cloudflare TURN when a direct WebRTC connection is unavailable.
The application exchanges a private, long-lived Cloudflare key on the server
for short-lived ICE credentials only after a participant is admitted. The
private key is never included in browser JavaScript.

## Environment

Create a TURN key in Cloudflare Realtime and add these server-only values to
the local and Glash deployment environments:

```dotenv
CMEET_TURN_KEY_ID=your_cloudflare_turn_key_id
CMEET_TURN_API_TOKEN=your_cloudflare_turn_api_token
```

Do not prefix either variable with `NEXT_PUBLIC_`. That prefix would expose the
long-lived secret to every visitor. An optional credential lifetime can be set
between one hour and 24 hours; CMeet defaults to 24 hours:

```dotenv
CMEET_TURN_TTL_SECONDS=86400
```

Restart the development server after changing `.env`. For production, sync the
same names through Glash before deploying.

## Application flow

1. A participant requests admission to a cMeet room.
2. The server confirms that the participant is staff, an invited client, or an
   admitted waiting-room guest.
3. `/api/cmeet/[code]/ice-servers` exchanges the private key with Cloudflare.
4. The browser receives only temporary STUN/TURN credentials and uses them for
   the peer connection.
5. If Cloudflare is temporarily unavailable, cMeet attempts a direct STUN
   connection and records a relay warning in the browser console.

## Verify

First test the key against Cloudflare's credential-generation endpoint without
printing the returned username or credential. A successful response is HTTP
`201` and contains `stun:`, `turn:`, and `turns:` URLs.

Then open the same cMeet room on two different networks, such as office Wi-Fi
and a phone on cellular. In the browser's WebRTC internals, the selected ICE
candidate pair should show candidate type `relay` when a direct path is not
available. Confirm microphone audio in both directions and camera video before
considering the relay fully verified.

The Docker Compose and Coturn configuration in this folder remain available as
a legacy self-hosted option, but the current application integration uses the
Cloudflare server-side credential flow described above.
