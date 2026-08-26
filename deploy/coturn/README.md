# CMeet TURN relay

`src/lib/cmeet-rtc.ts` adds a TURN server to its ICE configuration when three
public environment variables are present. Until they are, CMeet runs on STUN
alone, which means calls connect on the same network and fail between, say, a
phone on cellular and a laptop on office Wi-Fi.

## 1. Host

Any small VPS works; a relay is bandwidth-bound, not CPU-bound. Budget roughly
1.5 Mbps per relayed participant. Point `turn.cdsspace.pro` at its public IP.

## 2. Certificate

    certbot certonly --standalone -d turn.cdsspace.pro

`turns:` on 5349 needs this. It is the variant that survives firewalls which
block UDP, so do not skip it.

## 3. Configure and run

Edit `turnserver.conf` and replace `REPLACE_ME_PUBLIC_IP`, `REPLACE_ME_USER`
and `REPLACE_ME_PASSWORD`, then:

    docker compose up -d

Open UDP/TCP 3478, 5349, and UDP 49152-65535 in the firewall.

## 4. Point the app at it

Add to `.env`, using the same credentials:

    NEXT_PUBLIC_TURN_URL=turn:turn.cdsspace.pro:3478
    NEXT_PUBLIC_TURN_USERNAME=REPLACE_ME_USER
    NEXT_PUBLIC_TURN_CREDENTIAL=REPLACE_ME_PASSWORD

`buildRtcConfig()` derives the `turns:` 5349 entry automatically from a URL
ending in `:3478`, so only the one variable is needed.

These are `NEXT_PUBLIC_`, so the credential ships to every browser. That is
inherent to long-term TURN credentials. The `denied-peer-ip` rules above are
what stop that from becoming an open proxy into the host's network. Rotate the
password periodically.

## 5. Verify

Paste the three values into https://icetest.info or Trickle ICE. You must see
at least one candidate of type `relay`. If you only see `srflx`, TURN is not
actually working and cross-network calls will still fail.
