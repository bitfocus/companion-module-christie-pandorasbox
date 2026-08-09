# Companion Satellite Protocol — Spezifikation

**API-Version:** `1.14.0`
**Stand:** 2026-08-09
**Quelle:** [bitfocus/companion](https://github.com/bitfocus/companion), Branch `master` (MIT)

Diese Spezifikation wurde aus dem Companion-Quelltext rekonstruiert, nicht aus einer
offiziellen Protokolldokumentation — eine solche existiert nicht. Alle Angaben sind
mit Datei- und Zeilenangabe belegt und gegen den Code verifiziert, aber **nicht** gegen
eine laufende Instanz getestet. Vor der Implementierung siehe
[SATELLITE_SERVER_GUIDE.md](./SATELLITE_SERVER_GUIDE.md), Abschnitt „Was noch zu
verifizieren ist".

### Referenzdateien

| Datei | Inhalt |
|---|---|
| `companion/lib/Service/Satellite/SatelliteApi.ts` | Protokoll-Kern, Kommando-Dispatch, Handshake |
| `companion/lib/Service/SatelliteTcp.ts` | TCP-Transport (Port 16622) |
| `companion/lib/Service/SatelliteWebsocket.ts` | WebSocket-Transport (Port 16623) |
| `companion/lib/Surface/IP/Satellite.ts` | Surface-Seite: ausgehende Nachrichten |
| `companion/lib/Service/Satellite/SatelliteRenderUtil.ts` | Bitmap-/Style-Kodierung |
| `companion/lib/Service/Satellite/SatelliteSurfaceManifestSchema.ts` | `LAYOUT_MANIFEST`-Schema |
| `companion/lib/Service/Satellite/SatelliteConfigFieldsSchema.ts` | `CONFIG_FIELDS`-Schema |
| `companion/lib/Resources/Util.ts` | `parseLineParameters`, `isTruthy`, `isFalsey` |
| `companion/lib/Resources/Constants.ts` | Legacy-Grid-Konstanten |

---

## 1. Rollen und Begriffe

| Begriff | Bedeutung |
|---|---|
| **Server** | Die Seite, die den Port öffnet. Bei Companion: Companion selbst. Bei uns: unsere Anwendung. |
| **Client** | Die Seite, die sich verbindet und Hardware repräsentiert (z. B. Companion Satellite mit einem Stream Deck). |
| **Device / Surface** | Ein physisches Bedienfeld. Ein Client kann **mehrere** Devices über **eine** Verbindung anmelden. |
| **Control** | Ein einzelnes Bedienelement (Taste, Encoder) eines Devices. |
| **Subscription** | Abonnement auf einen einzelnen Button an einer festen Grid-Position — unabhängig von Devices. |

Der Client meldet Hardware an und schickt Eingaben. Der Server schickt darzustellende
Zustände zurück. **Es gibt keine Authentifizierung im Protokoll.**

---

## 2. Transport

### 2.1 TCP — Port 16622

`SatelliteTcp.ts:41` (`this.port = 16622`), Bind-Adresse `::` bzw. `0.0.0.0`
wenn `DISABLE_IPV6` gesetzt ist (`Constants.ts:7`).

- Zeilenbasiert, UTF-8, Trennzeichen `\n`
- Ein `\r` pro Zeile wird entfernt — `line.replace(/\r/, '')` in `SatelliteApi.ts:477`
  ersetzt nur das **erste** Vorkommen. `\r\n` funktioniert; ein `\r` mitten in der Zeile
  würde ebenfalls entfernt.
- Der Empfangspuffer wird über Paketgrenzen hinweg akkumuliert; ein `StringDecoder`
  behandelt mehrbyteige UTF-8-Zeichen an Paketgrenzen korrekt (`SatelliteTcp.ts:82-85`)
- **Maximale Zeilenlänge: 2 MiB** (`MAX_LINE_LENGTH`, `SatelliteApi.ts:78`). Wird sie
  ohne Newline überschritten, sendet Companion `ERROR ERROR MESSAGE="Line too long"`
  und schließt die Verbindung.
- **Idle-Timeout: 5 Sekunden** (`socket.setTimeout(5000)`, `SatelliteTcp.ts:73`). Bei
  Inaktivität wird die Verbindung mit `destroy()` hart geschlossen — kein sauberer
  FIN-Austausch.

### 2.2 WebSocket — Port 16623

`SatelliteWebsocket.ts:38`. Identische Zeilensyntax, transportiert in
WebSocket-Text-Frames. Eine Nachricht = ein Frame (der Zeilenpuffer arbeitet aber
genauso, mehrere Zeilen pro Frame sind zulässig).

- **Idle-Timeout: 5 Sekunden**, geprüft alle 3 Sekunden (`SatelliteWebsocket.ts:59-66`).
  Überschreitung führt zu `socket.terminate()`.
- Kein Subprotokoll, kein spezifischer Pfad im Code gesetzt.

### 2.3 Konsequenz für Keepalive

Beide Transports trennen nach 5 s Funkstille. Der Client muss regelmäßig senden;
`PING` ist dafür vorgesehen. **Empfehlung: alle 1–2 Sekunden.**

---

## 3. Nachrichtensyntax

### 3.1 Aufbau

```
<COMMAND> [OK|ERROR] [DEVICEID="<id>"] [KEY=VALUE ...] \n
```

Erstes Token bis zum ersten Leerzeichen ist das Kommando, der Rest ist der
Parameterblock (`SatelliteApi.ts:368-371`). Das Kommando wird
**case-insensitiv** verglichen (`cmd.toUpperCase()`), Parameternamen dagegen
**case-sensitiv** ausgewertet.

### 3.2 Parser-Regeln (eingehend)

`parseLineParameters` in `Util.ts:140-210`. Exakte Semantik — hier weicht die
naive Implementierung gern ab:

1. Zeichenweise Suche nach dem jeweils nächsten ` `, `\` oder `"`.
2. `\` escaped das **unmittelbar folgende Zeichen** — es wird wörtlich übernommen,
   beide Zeichen werden konsumiert. Gilt für jedes Zeichen, nicht nur `"`.
3. `"` schaltet den Quote-Modus um (XOR). Das Zeichen selbst wird verworfen.
4. Ein Leerzeichen **außerhalb** von Quotes beginnt ein neues Fragment. Innerhalb von
   Quotes ist es Teil des Werts.
5. Jedes Fragment wird am **ersten** `=` geteilt. Der Rest des Fragments — inklusive
   weiterer `=` — ist der Wert. Das ist wichtig für Base64-Padding und `data:`-URLs.
6. Fragment ohne `=` → Wert ist der Boolean `true`.
7. Leere Fragmente (aus mehrfachen/führenden/abschließenden Leerzeichen) werden
   verworfen.
8. Schlüssel aus `BANNED_PROPS` (`__proto__`, `constructor`, `prototype`) werden
   verworfen — Prototype-Pollution-Schutz. In einer C#-Implementierung technisch
   irrelevant, aber der Vollständigkeit halber erwähnt.

Der resultierende Typ ist `Record<string, string | true | undefined>` — ein Parameter
ist also entweder ein String, `true` (Flag ohne Wert) oder fehlt.

### 3.3 Serialisierung (ausgehend)

`SatelliteSocketWrapper.sendMessage` in `SatelliteApi.ts:94-118`:

```
chunks = [messageName]
if (status) chunks.push(status)                  // "OK" | "ERROR"
if (deviceId) chunks.push(`DEVICEID="${deviceId}"`)
for (key, value) of args:
    boolean → `KEY=1` / `KEY=0`
    number  → `KEY=42`
    string  → `KEY="wert"`
chunks.push('\n')
write(chunks.join(' '))
```

Zwei Konsequenzen, die man beim Nachbau kennen muss:

- **Jede Zeile endet mit einem Leerzeichen vor dem `\n`** (weil `'\n'` als letztes
  Element mit ` ` gejoint wird). Clients müssen damit umgehen; unser Server sollte es
  aus Kompatibilitätsgründen genauso machen.
- **Ausgehende Strings werden nicht escaped.** Companion setzt lediglich `"` außen
  herum. Ein Wert mit `"` oder `\n` würde das Protokoll zerlegen. Deshalb wird jeder
  Freitext (Button-Text, Variablenwerte, JSON-Payloads) **base64-kodiert** übertragen.
  → Unser Server darf niemals ungefilterten Freitext ausgeben.

### 3.4 Boolean-Auswertung

`Util.ts:120-133`:

```
isFalsey(v) = (typeof v === 'string' && v.toLowerCase() === 'false')
              || v == '0'
              || !Boolean(v)

isTruthy(v) = !isFalsey(v)
              && ( (typeof v === 'string' && (v.toLowerCase() === 'true' || v.toLowerCase() === 'yes'))
                   || Number(v) >= 1 )
```

Damit gilt:

| Eingabe | `isFalsey` | `isTruthy` |
|---|---|---|
| `"true"`, `"yes"`, `"1"`, `"5"` | false | **true** |
| `"false"`, `"0"`, `""`, fehlend | **true** | false |
| `true` (Flag ohne Wert) | false | false ⚠️ |
| `"maybe"` | false | false |

⚠️ **Falle:** Ein Parameter als reines Flag (`BITMAPS` ohne `=`) ist weder truthy noch
falsey. Manche Kommandos prüfen `!isFalsey(...)` (behandeln das Flag also als „an"),
andere `isTruthy(...)` (behandeln es als „aus"). Die Tabellen in Abschnitt 5 geben
jeweils an, welche Prüfung verwendet wird.

`parseStringParamWithBooleanFallback(list, default, param)` (`Util.ts:217-230`):
Ist der Wert in `list`, wird er zurückgegeben; sonst wenn `isTruthy` → `default`;
sonst `null`.

---

## 4. Verbindungsablauf

```
Client                                  Server
  │──── TCP connect / WS upgrade ────────▶│
  │                                       │
  │◀─── BEGIN CompanionVersion=… ApiVersion=1.14.0
  │◀─── CAPS SUBSCRIPTIONS=… NONSQUARE=1 BITMAP_FORMATS=… ROTARY_AMOUNT=1
  │                                       │
  │──── ADD-DEVICE DEVICEID=… ──────────▶│
  │◀─── ADD-DEVICE OK DEVICEID=…          │
  │                                       │
  │◀─── KEY-STATE DEVICEID=… KEY=0 …      │  (fortlaufend)
  │──── KEY-PRESS DEVICEID=… KEY=0 PRESSED=1
  │◀─── KEY-PRESS OK DEVICEID=…           │
  │                                       │
  │──── PING 12345 ─────────────────────▶│  (alle 1–2 s)
  │◀─── PONG 12345                        │
  │                                       │
  │──── QUIT ───────────────────────────▶│
  │◀─── (Verbindung geschlossen)          │
```

`BEGIN` und `CAPS` werden **unaufgefordert direkt nach dem Verbindungsaufbau**
gesendet (`SatelliteApi.ts:448-458`), noch bevor der Client etwas schickt.

Beim Verbindungsabbau entfernt der Server alle Devices dieser Verbindung
(`cleanupDevices`, `SatelliteApi.ts:493-504`) und meldet sie als `physicallyGone`.

---

## 5. Kommandos: Client → Server

Alle Kommandos, die ein `DEVICEID` erwarten, prüfen zusätzlich, dass das Device
**auf dieser Verbindung** registriert ist (`SatelliteApi.ts:530-547`). Andernfalls:
`<CMD> ERROR DEVICEID="…" MESSAGE="Device not found"`.

### 5.1 `ADD-DEVICE`

Meldet ein Device an. `SatelliteApi.ts:169-343`.

| Parameter | Pflicht | Typ | Bedeutung |
|---|---|---|---|
| `DEVICEID` | **ja** | string | Eindeutige ID. Darf nicht mit `emulator:` oder `group:` beginnen. |
| `PRODUCT_NAME` | **ja** | string | Anzeigename in der UI. |
| `SERIAL` | nein | string | Default: `DEVICEID`. Gleiche Präfix-Sperre. |
| `SERIAL_IS_UNIQUE` | nein | bool (`isTruthy`) | Default **true**. |
| `LAYOUT_MANIFEST` | nein | base64(JSON) | Aktiviert den Manifest-Modus (§7). Ohne diesen Parameter gilt der Legacy-Grid-Modus (§8). |
| `KEYS_TOTAL` | nein | int | Nur Legacy. Default 32, Bereich 1…2000. |
| `KEYS_PER_ROW` | nein | int | Nur Legacy. Default 8, Bereich 1…1000. |
| `BITMAPS` | nein | int / bool (`!isFalsey`) | Nur Legacy. Kantenlänge in px. Wert < 5 oder nicht-numerisch → **72**. |
| `COLORS` | nein | `hex` \| `rgb` \| bool | Nur Legacy. Boolean-Fallback → `hex`. |
| `TEXT` | nein | bool (`isTruthy`) | Nur Legacy. Button-Text anfordern. |
| `TEXT_STYLE` | nein | bool (`isTruthy`) | Nur Legacy. Schriftgröße anfordern. |
| `BITMAP_FORMAT` | nein | `rgb` \| `png` \| `webp` | Default und Fallback bei Unbekanntem: **`rgb`**. |
| `BRIGHTNESS` | nein | bool (`isTruthy`) | **Fehlend ⇒ true.** Nur explizit falsey deaktiviert den Helligkeitsregler. |
| `PINCODE_LOCK` | nein | `FULL` \| `PARTIAL` | Nur exakt diese beiden Werte aktivieren die clientseitige Lock-Darstellung. |
| `CAN_CHANGE_PAGE` | nein | string | Nicht-leerer String aktiviert Seitenwechsel. **Der String ist das Label der Checkbox in der Companion-UI.** |
| `VARIABLES` | nein | base64(JSON) | Transferable Values (§9). |
| `CONFIG_FIELDS` | nein | base64(JSON) | Gerätespezifische Konfigurationsfelder (§10). |

**Antwort:** `ADD-DEVICE OK DEVICEID="<id>"`

**Fehler:** `Missing DEVICEID`, `Missing PRODUCT_NAME`, `Reserved DEVICEID`,
`Reserved SERIAL`, `Device already added`, `Device exists elsewhere`,
`Invalid LAYOUT_MANIFEST`, `Invalid KEYS_TOTAL`, `Invalid KEYS_PER_ROW`,
`Invalid VARIABLES`, `Invalid CONFIG_FIELDS`

⚠️ `Device exists elsewhere` wird an die **andere** Verbindung gesendet, nicht an die
anfragende (`SatelliteApi.ts:196`). Das ist im Original vermutlich ein Bug; für
Kompatibilität ist es unerheblich, unser Server sollte an den Anfragenden antworten.

### 5.2 `REMOVE-DEVICE`

| Parameter | Pflicht |
|---|---|
| `DEVICEID` | **ja** |

**Antwort:** `REMOVE-DEVICE OK DEVICEID="<id>"`

### 5.3 `KEY-PRESS`

`SatelliteApi.ts:552-589`.

| Parameter | Pflicht | Modus |
|---|---|---|
| `DEVICEID` | **ja** | beide |
| `CONTROLID` | **ja** | nur Manifest-Modus |
| `KEY` | **ja** | nur Legacy-Modus (§8.1 zum Format) |
| `PRESSED` | **ja** | beide — ausgewertet mit `!isFalsey` |

**Antwort:** `KEY-PRESS OK DEVICEID="<id>"`
**Fehler:** `Missing CONTROLID`, `Missing KEY`, `Missing PRESSED`, `Invalid KEY`,
`Unknown CONTROLID`

⚠️ `PRESSED` wird zuerst auf Anwesenheit geprüft (`if (!params.PRESSED)`) — der Wert
`"0"` ist ein nicht-leerer String und passiert diese Prüfung, wird danach von
`!isFalsey("0")` korrekt zu `false`. Ein **leerer** Wert (`PRESSED=`) löst dagegen
`Missing PRESSED` aus.

### 5.4 `KEY-ROTATE`

`SatelliteApi.ts:618-656`. Wie `KEY-PRESS`, aber mit `DIRECTION` statt `PRESSED`.

**`DIRECTION`-Semantik** (`parseSatelliteRotationDelta`, `SatelliteApi.ts:971-980`) —
seit API 1.14.0 ein **vorzeichenbehafteter Zähler**:

| Wert | Ergebnis (delta) |
|---|---|
| `"3"` | `+3` (3 Schritte im Uhrzeigersinn) |
| `"-2"` | `-2` (2 Schritte gegen den Uhrzeigersinn) |
| `"0"` | `-1` — Rückwärtskompatibilität mit der alten Boolean-Notation |
| `"1"` | `+1` |
| nicht-numerisch | `raw >= '1' ? 1 : -1` — **String-Vergleich**, nicht numerisch |

Vor 1.14.0 war `DIRECTION` ein Boolean (`0` = links, `1` = rechts). Die
Unterstützung für Beträge wird per `ROTARY_AMOUNT` in `CAPS` angekündigt.

### 5.5 `PINCODE-KEY`

| Parameter | Pflicht | Bereich |
|---|---|---|
| `DEVICEID` | **ja** | |
| `KEY` | **ja** | Ganzzahl 0…9 |

**Antwort:** `PINCODE-KEY OK DEVICEID="<id>"`
**Fehler:** `Missing KEY`, `Invalid KEY`

### 5.6 `SET-VARIABLE-VALUE`

Setzt eine als `input` deklarierte Transferable Value (§9).

| Parameter | Pflicht | Format |
|---|---|---|
| `DEVICEID` | **ja** | |
| `VARIABLE` | **ja** | ID aus der `VARIABLES`-Deklaration |
| `VALUE` | **ja** | **base64** des Werts |

**Antwort:** `SET-VARIABLE-VALUE OK DEVICEID="<id>" VARIABLE="<name>"`
(die Rückgabe des Variablennamens kam mit 1.7.1)

Unbekannte Variablennamen werden **stillschweigend verworfen**
(`Surface/IP/Satellite.ts:429-439`) — es gibt keine Fehlermeldung.

### 5.7 `FIRMWARE-UPDATE-INFO`

| Parameter | Pflicht |
|---|---|
| `DEVICEID` | **ja** |
| `UPDATE_URL` | **ja** — leerer String löscht die Meldung |

**Antwort:** `FIRMWARE-UPDATE-INFO OK DEVICEID="<id>"`

### 5.8 `CHANGE-PAGE`

| Parameter | Pflicht | Bedeutung |
|---|---|---|
| `DEVICEID` | **ja** | |
| `DIRECTION` | **ja** | `isTruthy` ⇒ vorwärts, sonst rückwärts |

**Antwort:** `CHANGE-PAGE OK DEVICEID="<id>"`

Wirkt nur, wenn das Device `CAN_CHANGE_PAGE` gesetzt hat **und** der Nutzer die
Checkbox in der Surface-Konfiguration aktiviert hat (`Surface/IP/Satellite.ts:406-409`).
Ohne beides passiert nichts — trotzdem wird `OK` gesendet.

### 5.9 Subscriptions: `ADD-SUB`, `REMOVE-SUB`, `SUB-PRESS`, `SUB-ROTATE`

Eingeführt mit API 1.10.0. **Alle vier Kommandos sind global abschaltbar** über die
Companion-Einstellung `satellite_subscriptions_enabled`; ist sie aus, antworten sie
mit `Subscriptions not enabled`. Der Zustand wird in `CAPS` als `SUBSCRIPTIONS`
angekündigt. Beim Umschalten trennt Companion **alle** Satellite-Verbindungen, damit
Clients `CAPS` neu lesen (`SatelliteApi.ts:918-924`).

Subscriptions sind an **kein** Device gebunden — sie hängen an einer Grid-Position
und existieren pro Socket.

#### `ADD-SUB`

| Parameter | Pflicht | Format |
|---|---|---|
| `SUBID` | **ja** | Regex `^[a-zA-Z0-9\-/]+$`, pro Socket eindeutig |
| `LOCATION` | **ja** | Regex `^(\d+)/(\d+)/(\d+)$` = `page/row/column` |
| `STYLE` | nein | base64(JSON) eines `SatelliteControlStylePreset` (§7.2) |
| `BITMAP` | nein | int/bool — nur wenn `STYLE` fehlt. < 5 → 72 |
| `COLORS` | nein | `hex` \| `rgb` \| bool — nur wenn `STYLE` fehlt |
| `TEXT` | nein | bool (`isTruthy`) — nur wenn `STYLE` fehlt |
| `TEXT_STYLE` | nein | bool (`isTruthy`) — nur wenn `STYLE` fehlt |
| `BITMAP_FORMAT` | nein | `rgb` \| `png` \| `webp`, Default `rgb` |

**Antwort:** `ADD-SUB OK SUBID="<id>"` (**ohne** `DEVICEID`)
Direkt danach folgt unaufgefordert ein initiales `SUB-STATE`.

**Fehler:** `Subscriptions not enabled`, `Missing SUBID`, `Invalid SUBID`,
`SUBID already in use`, `Missing LOCATION`, `Invalid LOCATION`, `Invalid STYLE`

#### `REMOVE-SUB`

| Parameter | Pflicht |
|---|---|
| `SUBID` | **ja** |

**Antwort:** `REMOVE-SUB OK SUBID="<id>"`
**Fehler:** `Missing SUBID`, `Unknown SUBID`

#### `SUB-PRESS` / `SUB-ROTATE`

| Parameter | Pflicht |
|---|---|
| `SUBID` | **ja** |
| `PRESSED` | **ja** (nur `SUB-PRESS`, `!isFalsey`) |
| `DIRECTION` | **ja** (nur `SUB-ROTATE`, Semantik wie §5.4) |

**Antwort:** `SUB-PRESS OK SUBID="<id>"` bzw. `SUB-ROTATE OK SUBID="<id>"`

Intern erzeugt Companion die Surface-ID `satellite-sub:<clientId>:<subId>`. Ist an der
Position kein Control vorhanden, passiert nichts — die Antwort ist trotzdem `OK`.

### 5.10 `PING` / `PONG` / `QUIT`

| Kommando | Verhalten |
|---|---|
| `PING <beliebiger rest>` | Antwortet `PONG <beliebiger rest>` — der komplette Rest der Zeile wird als Teil des **Nachrichtennamens** zurückgespiegelt (`SatelliteApi.ts:411`). |
| `PONG` | Wird ignoriert. |
| `QUIT` | Verbindung wird sofort mit `destroy()` geschlossen. Keine Antwort. |

`PING`-Zeilen werden vom Logging ausgenommen (`SatelliteApi.ts:364`).

### 5.11 Unbekanntes Kommando

```
ERROR MESSAGE="Unknown command: <COMMAND-IN-GROSSBUCHSTABEN"
```

Ohne `OK`/`ERROR`-Status-Token und ohne `DEVICEID` (`SatelliteApi.ts:421-423`).

---

## 6. Nachrichten: Server → Client

### 6.1 `BEGIN`

```
BEGIN CompanionVersion="<appBuild>" ApiVersion="1.14.0" 
```

⚠️ `CompanionVersion` enthält `appInfo.appBuild`, **nicht** die Versionsnummer
(`SatelliteApi.ts:449`).

### 6.2 `CAPS`

```
CAPS SUBSCRIPTIONS=<0|1> NONSQUARE=1 BITMAP_FORMATS="rgb,webp,png" ROTARY_AMOUNT=1 
```

| Feld | Seit | Bedeutung |
|---|---|---|
| `SUBSCRIPTIONS` | 1.10.0 | Subscription-API verfügbar |
| `NONSQUARE` | 1.11.0 | Nicht-quadratische Buttons werden unterstützt |
| `BITMAP_FORMATS` | 1.12.0 | Komma-Liste. Reihenfolge im Code: `rgb,png,webp` (`SatelliteRenderUtil.ts:22`). `rgb` ist immer enthalten. |
| `ROTARY_AMOUNT` | 1.14.0 | `DIRECTION` darf ein vorzeichenbehafteter Betrag sein |

### 6.3 `KEY-STATE`

Der Zustand eines Controls. `Surface/IP/Satellite.ts:322-352`.

| Feld | Immer? | Inhalt |
|---|---|---|
| `DEVICEID` | ja | |
| `KEY` | Legacy-Modus | Linearer Index (§8.1) |
| `CONTROLID` | Manifest-Modus | Control-ID aus dem Manifest |
| `LOCATION` | wenn bekannt | `page/row/column` — seit 1.10.0 für alle Button-Typen |
| `PRESSED` | ja | `1`/`0` — gedrückter Zustand |
| `TYPE` | ja | `BUTTON` \| `PAGEUP` \| `PAGEDOWN` \| `PAGENUM` |
| `BITMAP` | nur wenn angefordert | §6.8 |
| `COLOR` | nur wenn angefordert | Hintergrundfarbe |
| `TEXTCOLOR` | nur wenn angefordert | Textfarbe |
| `TEXT` | nur wenn angefordert | **base64** des Button-Texts |
| `FONT_SIZE` | nur wenn angefordert | Zahl oder String `auto` |
| `LEDS` | nur wenn angefordert | §6.9 |

Welche Style-Felder kommen, bestimmt das Style-Preset des jeweiligen Controls
(§7.2) — nicht das Device global.

### 6.4 `SUB-STATE`

```
SUB-STATE SUBID="<id>" PRESSED=<0|1> TYPE="BUTTON" [BITMAP=…] [COLOR=…] … 
```

Identische Style-Felder wie `KEY-STATE`, aber mit `SUBID` statt
`DEVICEID`/`KEY`/`CONTROLID` und **ohne** `LOCATION`. Wird gesendet bei `ADD-SUB` und
bei jeder Neuzeichnung des Buttons an der abonnierten Position
(`SatelliteApi.ts:930-942`).

### 6.5 `KEYS-CLEAR`

```
KEYS-CLEAR DEVICEID="<id>" 
```

Alle Tasten löschen. Wird u. a. beim Sperren gesendet, wenn das Device kein
`PINCODE_LOCK` unterstützt.

### 6.6 `BRIGHTNESS`

```
BRIGHTNESS DEVICEID="<id>" VALUE=<0-100> 
```

Nur bei Devices mit `supportsBrightness`. Wird bei jeder Änderung des
Konfigurationswerts gesendet.

### 6.7 `LOCKED-STATE`

```
LOCKED-STATE DEVICEID="<id>" LOCKED=<0|1> CHARACTER_COUNT=<n> ROTATION=<0|90|180|-90> 
```

Nur bei Devices mit `PINCODE_LOCK=FULL|PARTIAL`. `CHARACTER_COUNT` ist die Länge des
erwarteten PIN-Codes. `ROTATION` (seit 1.10.1) leitet sich aus der Surface-Konfiguration
ab (`Surface/IP/Satellite.ts:266-285`).

Devices **ohne** Lock-Unterstützung bekommen stattdessen `KEYS-CLEAR` plus
`KEY-STATE`-Nachrichten mit einem gerenderten Schloss-Symbol.

### 6.8 `VARIABLE-VALUE`

```
VARIABLE-VALUE DEVICEID="<id>" VARIABLE="<name>" VALUE="<base64>" 
```

Wert einer als `output` deklarierten Transferable Value. Wird nur bei tatsächlicher
Wertänderung gesendet, mit Debounce (5 ms, max. 20 ms;
`Surface/IP/Satellite.ts:494-500`).

### 6.9 `DEVICE-CONFIG`

```
DEVICE-CONFIG DEVICEID="<id>" CONFIG="<base64(JSON)>" 
```

Aktuelle Werte der über `CONFIG_FIELDS` deklarierten Felder. Das JSON ist ein flaches
Objekt `{ "<feldId>": <wert> }` — die IDs sind **ohne** den internen Präfix, den
Companion beim Import anfügt (`PluginConfigFields.ts:35-49`).

Wird nur gesendet, wenn mindestens ein Feld einen anderen Typ als `static-text` hat.

### 6.10 Bitmap-Kodierung

`SatelliteRenderUtil.ts:53-70`. Die Kodierung wird pro Device bzw. pro Subscription
über `BITMAP_FORMAT` ausgehandelt:

| Format | Übertragung |
|---|---|
| `rgb` (Default) | **Rohe Pixeldaten**, base64-kodiert. 3 Bytes pro Pixel (R, G, B), kein Alpha. Größe = `w * h * 3` Bytes. |
| `png` / `webp` | Vollständige **Data-URL**, z. B. `data:image/webp;base64,…`, verbatim übertragen. |

Der Client unterscheidet beide Fälle am `data:`-Präfix. Ein Server, der `png`/`webp`
in `CAPS` anbietet, muss also Data-URLs senden — kein nacktes Base64.

Bei `rgb` wird ein leerer Buffer (Länge 0) **nicht** gesendet — das Feld `BITMAP`
fehlt dann komplett.

Die Bitmap-Größe kommt aus dem Style-Preset (`bitmap: {w, h}`). Die Surface-Rotation
aus der Companion-Konfiguration wird beim Rendern angewendet, bevor gesendet wird.

### 6.11 Farb-Kodierung

`SatelliteRenderUtil.ts:72-83`. Abhängig von `colors` im Style-Preset:

| `colors` | `COLOR` / `TEXTCOLOR` Format |
|---|---|
| `rgb` | `rgb(12,34,56)` — **ohne Leerzeichen** |
| `hex` | `#0c2238` — Kleinbuchstaben, immer 6 Stellen |

Default bei fehlendem Style ist Schwarz (`rgb(0,0,0)` bzw. `#000000`).

### 6.12 LED-Kodierung

`LEDS` ist **immer** roh-RGB in base64 — unabhängig vom ausgehandelten
`BITMAP_FORMAT`. Ein `R,G,B`-Tripel pro Segment, in der im Style-Preset
deklarierten Segmentanzahl und -reihenfolge (§7.2).

---

## 7. Manifest-Modus (`LAYOUT_MANIFEST`)

Seit API 1.9.0. Der Client beschreibt sein Layout explizit statt über ein
Rechteck-Grid. Aktiviert, sobald `LAYOUT_MANIFEST` bei `ADD-DEVICE` gesetzt ist.

Im Manifest-Modus adressieren `KEY-PRESS` und `KEY-ROTATE` Controls über `CONTROLID`
statt `KEY`, und `KEY-STATE` liefert `CONTROLID` zurück.

### 7.1 Struktur

Base64-kodiertes JSON, validiert gegen `SatelliteSurfaceLayoutSchema`
(`SatelliteSurfaceManifestSchema.ts:72-87`):

```jsonc
{
  "stylePresets": {
    "default": { /* SatelliteControlStylePreset */ },
    "encoder": { /* optional weitere, frei benannt */ }
  },
  "controls": {
    "0/0": { "row": 0, "column": 0 },
    "0/1": { "row": 0, "column": 1, "stylePreset": "encoder" }
  }
}
```

- `stylePresets.default` ist **Pflicht**.
- Control-IDs müssen dem Regex `^[a-zA-Z0-9\-/]+$` genügen. Konvention ist `row/column`.
- Verweist `stylePreset` auf einen unbekannten Namen, wird stillschweigend `default`
  verwendet (`Surface/IP/Satellite.ts:168-171`).
- **Mehrere Controls dürfen auf derselben `row`/`column` liegen.** Companion sendet
  dann für jedes ein eigenes `KEY-STATE` mit dem jeweiligen Style
  (`Surface/IP/Satellite.ts:380-386`) — so lässt sich z. B. ein Encoder mit LED-Ring
  als zwei Controls mit unterschiedlichen Style-Presets modellieren.
- Die Grid-Größe wird aus dem Maximum von `row+1` / `column+1` über alle Controls
  berechnet (`SatelliteApi.ts:219-225`).

### 7.2 `SatelliteControlStylePreset`

| Feld | Typ | Bedeutung |
|---|---|---|
| `bitmap` | `{ w: number, h: number }` | Bitmaps dieser Pixelgröße anfordern. `w`/`h` ≥ 0. |
| `text` | boolean | Button-Text anfordern (`TEXT`, base64) |
| `textStyle` | boolean | Schriftgröße anfordern (`FONT_SIZE`) |
| `colors` | `hex` \| `rgb` | Farben anfordern (`COLOR`, `TEXTCOLOR`) |
| `leds` | `{ segments: 1…200, mode: 'full-ring' \| 'simple' }` | LED-Werte anfordern (`LEDS`) |

**`leds.mode`** (`SatelliteSurfaceManifestSchema.ts:17-27`):
- `full-ring`: LEDs bilden einen vollständigen Kreis, die Gauge wird 1:1 abgebildet
  (Winkel, Deadzone, Farben). Segment 0 liegt auf **6 Uhr**, Indizes steigen im
  Uhrzeigersinn.
- `simple`: beliebige Form; der Wert wird über alle Segmente gestreut, Segment 0 ist
  das 0 %-Ende.

In beiden Fällen bildet das Device selbst auf seine physische Verdrahtung um.

---

## 8. Legacy-Grid-Modus

Ohne `LAYOUT_MANIFEST`. Companion erzeugt intern ein Manifest aus `KEYS_TOTAL` /
`KEYS_PER_ROW` (`SatelliteApi.ts:226-276`):

- Control-ID = `"<row>/<column>"`, fortlaufend gefüllt:
  `row = floor(i / KEYS_PER_ROW)`, `column = i % KEYS_PER_ROW`
- Grid: `columns = KEYS_PER_ROW`, `rows = ceil(KEYS_TOTAL / KEYS_PER_ROW)`
- Ein einziges Style-Preset (`default`) aus `BITMAPS`, `COLORS`, `TEXT`, `TEXT_STYLE`

**Grenzen:** `KEYS_TOTAL` 1…2000, `KEYS_PER_ROW` 1…1000. Defaults: 32 bzw. 8
(`Constants.ts:1-2`).

### 8.1 Das `KEY`-Format

`parseKeyParam` in `Surface/IP/Satellite.ts:359-374` akzeptiert eingehend **zwei**
Schreibweisen:

| Form | Beispiel | Bedeutung |
|---|---|---|
| `<row>/<column>` | `2/3`, `+2/+3` | Zeile/Spalte, nullbasiert, führendes `+` erlaubt |
| `<index>` | `19` | Linearer Index, nullbasiert, zeilenweise |

Beide werden gegen die Grid-Größe validiert; außerhalb liegende Werte ergeben
`Invalid KEY`. **Ausgehend** sendet Companion immer den linearen Index
(`Surface/IP/Satellite.ts:329-332`).

⚠️ Reihenfolge im Parser: Die `row/column`-Variante wird zuerst geprüft. Ein reiner
Zahlenstring fällt auf den Index-Pfad.

---

## 9. Transferable Values (`VARIABLES`)

Seit API 1.7.0. Base64-kodiertes JSON-Array (`SatelliteApi.ts:982-1016`):

```json
[
  { "id": "cpu",     "type": "output", "name": "CPU Last",   "description": "optional" },
  { "id": "encoder", "type": "input",  "name": "Encoderwert" }
]
```

| Feld | Pflicht | Typ |
|---|---|---|
| `id` | ja | string |
| `type` | ja | `input` \| `output` |
| `name` | ja | string — Label in der UI |
| `description` | nein | string — Tooltip |

Jeder andere `type` lässt das gesamte `ADD-DEVICE` mit `Invalid VARIABLES` scheitern.

**Richtungen** (aus Sicht des Devices):

- **`input`** — Das Device liefert Werte. Companion legt ein Feld vom Typ
  `custom-variable` an; der Nutzer wählt dort eine Custom Variable aus. Das Device
  sendet `SET-VARIABLE-VALUE`, Companion schreibt in die gewählte Variable. Ohne
  Zuordnung durch den Nutzer wird der Wert verworfen.
- **`output`** — Das Device empfängt Werte. Companion legt ein Feld vom Typ
  `expression` an; der Nutzer trägt einen Ausdruck ein. Companion wertet ihn aus und
  sendet `VARIABLE-VALUE` bei jeder Änderung.

IDs aus `BANNED_PROPS` werden übersprungen (`Surface/IP/Satellite.ts:104`).

---

## 10. Gerätespezifische Konfigurationsfelder (`CONFIG_FIELDS`)

Seit API 1.10.0. Base64-kodiertes JSON-Array, validiert gegen
`SatelliteConfigFieldsSchema`. Die Felder erscheinen in der Companion-UI in den
Surface-Einstellungen; die Werte werden über `DEVICE-CONFIG` zurückgeschickt.

**Gemeinsame Felder:** `id` (Pflicht — Schlüssel im `DEVICE-CONFIG`-JSON),
`label` (Pflicht), `description`, `tooltip`, `isVisibleExpression`.

| `type` | Zusätzliche Felder |
|---|---|
| `static-text` | `value: string` (Pflicht) |
| `textinput` | `default`, `regex`, `multiline` |
| `dropdown` | `choices: [{id: string\|number, label: string}]` (Pflicht, ≥1), `default`, `allowCustom` |
| `number` | `min` (Pflicht), `max` (Pflicht), `default`, `step` |
| `checkbox` | `default: boolean` |

Beispiel:

```json
[
  { "id": "backlight", "type": "number", "label": "Hintergrundlicht", "min": 0, "max": 255, "default": 128 },
  { "id": "mode", "type": "dropdown", "label": "Modus",
    "choices": [{"id": "a", "label": "Normal"}, {"id": "b", "label": "Invertiert"}] }
]
```

---

## 11. Fehlermeldungen — vollständige Liste

Format: `<KOMMANDO> ERROR [DEVICEID="<id>"] MESSAGE="<text>"`

| Meldung | Kommando(s) |
|---|---|
| `Missing DEVICEID` | alle device-gebundenen |
| `Device not found` | alle device-gebundenen |
| `Missing PRODUCT_NAME` | `ADD-DEVICE` |
| `Reserved DEVICEID` / `Reserved SERIAL` | `ADD-DEVICE` |
| `Device already added` / `Device exists elsewhere` | `ADD-DEVICE` |
| `Invalid LAYOUT_MANIFEST` | `ADD-DEVICE` |
| `Invalid KEYS_TOTAL` / `Invalid KEYS_PER_ROW` | `ADD-DEVICE` |
| `Invalid VARIABLES` / `Invalid CONFIG_FIELDS` | `ADD-DEVICE` |
| `Missing KEY` / `Invalid KEY` | `KEY-PRESS`, `KEY-ROTATE`, `PINCODE-KEY` |
| `Missing CONTROLID` / `Unknown CONTROLID` | `KEY-PRESS`, `KEY-ROTATE` |
| `Missing PRESSED` | `KEY-PRESS`, `SUB-PRESS` |
| `Missing DIRECTION` | `KEY-ROTATE`, `SUB-ROTATE`, `CHANGE-PAGE` |
| `Missing VARIABLE` / `Missing VALUE` | `SET-VARIABLE-VALUE` |
| `Missing UPDATE_URL` | `FIRMWARE-UPDATE-INFO` |
| `Subscriptions not enabled` | `ADD-SUB`, `REMOVE-SUB`, `SUB-PRESS`, `SUB-ROTATE` |
| `Missing SUBID` / `Invalid SUBID` / `Unknown SUBID` / `SUBID already in use` | Subscription-Kommandos |
| `Missing LOCATION` / `Invalid LOCATION` / `Invalid STYLE` | `ADD-SUB` |
| `Line too long` | verbindungsweit, danach Trennung |
| `Unknown command: <X>` | ohne Status-Token, siehe §5.11 |

---

## 12. Versionshistorie

Aus dem Kommentarblock `SatelliteApi.ts:36-70`:

| Version | Änderung |
|---|---|
| 1.0.0 | Erstveröffentlichung |
| 1.1.0 | `TYPE` und `PRESSED` in `KEY-STATE` |
| 1.2.0 | `DEVICEID` in `ERROR`-Antworten, wo bekannt |
| 1.3.0 | `KEY-ROTATE` |
| 1.4.0 | `TEXT_STYLE` bei `ADD-DEVICE`, `FONT_SIZE` in `KEY-STATE` |
| 1.5.0 | Bitmap-Größe über `BITMAPS` wählbar |
| 1.5.1 | Größenlimit für Surfaces entfernt |
| 1.6.0 | `row/column`-Notation; Textfarbe; wählbares Farbformat; CSS-Farben; > 32 Tasten |
| 1.7.0 | Transferable Values; Helligkeitsregler abwählbar |
| 1.7.1 | `VARIABLE` in der `SET-VARIABLE-VALUE`-Erfolgsantwort |
| 1.8.0 | Clientseitige Darstellung des Locked-State |
| 1.9.0 | Komplexe Surface-Schemata (`LAYOUT_MANIFEST`) |
| 1.10.0 | Subscription-API; `LOCATION` in `KEY-STATE`; `FIRMWARE-UPDATE-INFO`; `CONFIG_FIELDS`; `DEVICE-CONFIG`; `CHANGE-PAGE` |
| 1.10.1 | `ROTATION` in `LOCKED-STATE` |
| 1.11.0 | `NONSQUARE` in `CAPS` |
| 1.12.0 | `BITMAP_FORMATS` in `CAPS`, `BITMAP_FORMAT` bei `ADD-DEVICE`/`ADD-SUB` |
| 1.13.0 | `leds` in Style-Presets |
| 1.14.0 | `DIRECTION` als vorzeichenbehafteter Betrag; `ROTARY_AMOUNT` in `CAPS` |

---

## 13. Beispielsitzung

```
S→C  BEGIN CompanionVersion="4.2.0+7834-master-a1b2c3d" ApiVersion="1.14.0" 
S→C  CAPS SUBSCRIPTIONS=1 NONSQUARE=1 BITMAP_FORMATS="rgb,png,webp" ROTARY_AMOUNT=1 

C→S  ADD-DEVICE DEVICEID="sd-xl-A00N1A123456" PRODUCT_NAME="Stream Deck XL" KEYS_TOTAL=32 KEYS_PER_ROW=8 BITMAPS=96 COLORS=hex TEXT=1 BITMAP_FORMAT=webp BRIGHTNESS=1
S→C  ADD-DEVICE OK DEVICEID="sd-xl-A00N1A123456" 

S→C  BRIGHTNESS DEVICEID="sd-xl-A00N1A123456" VALUE=100 
S→C  KEY-STATE DEVICEID="sd-xl-A00N1A123456" KEY=0 LOCATION="1/0/0" PRESSED=0 TYPE="BUTTON" BITMAP="data:image/webp;base64,UklGR..." COLOR="#1a1a1a" TEXTCOLOR="#ffffff" TEXT="U3RhcnQ=" 

C→S  KEY-PRESS DEVICEID="sd-xl-A00N1A123456" KEY=0 PRESSED=1
S→C  KEY-PRESS OK DEVICEID="sd-xl-A00N1A123456" 
S→C  KEY-STATE DEVICEID="sd-xl-A00N1A123456" KEY=0 LOCATION="1/0/0" PRESSED=1 TYPE="BUTTON" BITMAP="data:image/webp;base64,UklGR..." COLOR="#1a1a1a" TEXTCOLOR="#ffffff" TEXT="U3RhcnQ=" 

C→S  KEY-PRESS DEVICEID="sd-xl-A00N1A123456" KEY=0 PRESSED=0
S→C  KEY-PRESS OK DEVICEID="sd-xl-A00N1A123456" 

C→S  KEY-ROTATE DEVICEID="sd-plus-B1" KEY=3/0 DIRECTION=-2
S→C  KEY-ROTATE OK DEVICEID="sd-plus-B1" 

C→S  PING 1754745600123
S→C  PONG 1754745600123 

C→S  QUIT
```

(Zeilen des Servers enden mit Leerzeichen + `\n`, siehe §3.3.)

---

## 14. Lizenz und Herkunft

Companion steht unter der MIT-Lizenz (`LICENSE.md`, Teil 1; Teil 2 ist eine
Contributor-Vereinbarung und betrifft nur Beiträge an das Projekt). Diese
Spezifikation ist eine eigenständige Beschreibung des Nachrichtenformats, erstellt
durch Lesen des öffentlich zugänglichen Quelltexts.
