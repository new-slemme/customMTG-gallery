# custom-mtg-gallery API

REST API for browsing custom Magic: The Gathering card sets. The response shapes closely follow [Scryfall's API conventions](https://scryfall.com/docs/api): every object carries a discriminating `object` field, list endpoints return a **List object**, and errors return an **Error object**.

Base URL: `http://localhost:3000` (configurable via `PORT` env var)

---

## Object Types

### Card object

Returned by card endpoints. Fields sourced from the JSON files in `cards_json/`; computed fields are derived server-side.

| Field | Type | Description |
|---|---|---|
| `object` | `"card"` | Discriminator |
| `id` | `string` | 12-character hex ID (SHA-1 of `setCode\|name`) |
| `name` | `string` | Card name |
| `mana_cost` | `string` | Mana cost. Accepts Scryfall notation (`{1}{R}{W}`) and shorthand (`1RW`) |
| `cmc` | `number` | Converted mana cost / mana value (computed) |
| `type_line` | `string` | Full type line, e.g. `"Legendary Creature — Human Tamer"` |
| `types` | `string[]` | Main types parsed from the left side of the em-dash, e.g. `["Legendary Creature"]` |
| `subtypes` | `string[]` | Subtypes parsed from the right side of the em-dash, e.g. `["Human","Tamer"]` |
| `oracle_text` | `string` | Rules text |
| `power` | `string \| null` | Power (may be `"*"` or a number string) |
| `toughness` | `string \| null` | Toughness (may be `"*"` or a number string) |
| `loyalty` | `string \| null` | Loyalty (planeswalkers), if present in source data |
| `colors` | `string[]` | Colors derived from `mana_cost`, in WUBRG order, e.g. `["R","W"]` |
| `color_identity` | `string[]` | Colors from `mana_cost` plus any mana symbols in `oracle_text` |
| `keywords` | `string[]` | Recognized keyword abilities found in `oracle_text` |
| `set` | `string` | Set code, matches the folder name under `SETS_DIR` |
| `image_status` | `"highres_scan" \| "missing"` | Whether a card image file was found |
| `image_uris` | `object \| null` | Image URLs, or `null` when no image was found |
| `image_uris.normal` | `string` | Full-resolution image URL |
| `image_uris.small` | `string` | Thumbnail URL (WebP, 280 px wide) |

Source JSON fields accepted as input aliases:

| Source field | Normalized to |
|---|---|
| `mana` | `mana_cost` |
| `type` | `type_line` |
| `rules` | `oracle_text` |
| `pt` (`"3/2"`) | `power` + `toughness` |

---

### Set object

| Field | Type | Description |
|---|---|---|
| `object` | `"set"` | Discriminator |
| `code` | `string` | Set code (folder name) |
| `name` | `string` | Human-readable name (from `set.json` → `title`, or derived from folder name) |
| `set_type` | `"custom"` | Always `"custom"` for user-provided sets |
| `description` | `string` | Optional description from `set.json` |
| `card_count` | `number` | Number of cards loaded from the set |
| `image_count` | `number` | Number of cards with a matched image file |
| `search_uri` | `string` | Pre-built search URL scoped to this set |

---

### List object

All list endpoints return this wrapper.

| Field | Type | Description |
|---|---|---|
| `object` | `"list"` | Discriminator |
| `total_cards` | `number` | Total results (before pagination) |
| `has_more` | `boolean` | `true` when more pages are available |
| `next_page` | `string` | *(present only when `has_more` is `true`)* URL for the next page |
| `data` | `array` | The objects for this page |

---

### Error object

Returned with a non-2xx HTTP status whenever a request fails.

| Field | Type | Description |
|---|---|---|
| `object` | `"error"` | Discriminator |
| `status` | `number` | HTTP status code |
| `code` | `string` | Machine-readable error code |
| `details` | `string` | Human-readable explanation |

Common error codes: `not_found`, `bad_request`.

---

### Catalog object

Returned by the autocomplete endpoint.

| Field | Type | Description |
|---|---|---|
| `object` | `"catalog"` | Discriminator |
| `uri` | `string` | The request URI that produced this catalog |
| `total_values` | `number` | Number of entries returned |
| `data` | `string[]` | Matching card names, sorted alphabetically |

---

## Endpoints

### Health

#### `GET /api/health`

Returns server status and the timestamp of the last successful scan.

**Response**

```json
{
  "ok": true,
  "scannedAt": 1709123456789,
  "setsDir": "/sets"
}
```

---

### Sets

#### `GET /api/sets`

Returns a List object containing all Set objects, sorted alphabetically by name.

**Response** `200`

```json
{
  "object": "list",
  "total_cards": 1,
  "has_more": false,
  "data": [
    {
      "object": "set",
      "code": "digiMTG",
      "name": "DigiMTG",
      "set_type": "custom",
      "description": "Digimon-themed custom Magic set",
      "card_count": 148,
      "image_count": 95,
      "search_uri": "/api/cards/search?q=set%3AdigiMTG&order=name"
    }
  ]
}
```

---

#### `GET /api/sets/:code`

Returns a single Set object by its code.

**Path params**

| Param | Description |
|---|---|
| `code` | Set code (case-sensitive, matches the folder name) |

**Responses**

- `200` — Set object
- `404` — Error object (`not_found`)

---

#### `GET /api/sets/:code/cards`

Returns a List object of all Card objects in the set, sorted alphabetically by name. Not paginated — all cards are returned at once.

**Path params**

| Param | Description |
|---|---|
| `code` | Set code |

**Responses**

- `200` — List object with Card objects
- `404` — Error object (`not_found`)

**Example response** `200`

```json
{
  "object": "list",
  "total_cards": 148,
  "has_more": false,
  "data": [
    {
      "object": "card",
      "id": "a1b2c3d4e5f6",
      "name": "Agumon, Brave Rookie",
      "mana_cost": "1R",
      "cmc": 2,
      "type_line": "Legendary Creature — Digimon",
      "types": ["Legendary Creature"],
      "subtypes": ["Digimon"],
      "oracle_text": "Haste\nWhen ~ enters, deal 2 damage to any target.",
      "power": "2",
      "toughness": "1",
      "loyalty": null,
      "colors": ["R"],
      "color_identity": ["R"],
      "keywords": ["Haste"],
      "set": "digiMTG",
      "image_status": "highres_scan",
      "image_uris": {
        "normal": "/api/sets/digiMTG/images/Agumon%2C%20Brave%20Rookie.png",
        "small": "/api/sets/digiMTG/thumbnails/Agumon%2C%20Brave%20Rookie.png"
      }
    }
  ]
}
```

---

### Cards

#### `GET /api/cards/search`

Searches across all cards in all sets. Returns a paginated List object of Card objects (up to **175 per page**, matching Scryfall's default).

**Query params**

| Param | Default | Description |
|---|---|---|
| `q` | *(required)* | Search query (see [Query Syntax](#query-syntax) below) |
| `page` | `1` | Page number (1-based) |
| `order` | `name` | Sort field: `name`, `cmc`, `set` |
| `dir` | `asc` | Sort direction: `asc`, `desc` |

**Responses**

- `200` — List object with Card objects
- `404` — Error object (`not_found`) when no cards match
- `422` — Error object (`bad_request`) when `q` is missing

**Example**

```
GET /api/cards/search?q=t%3Acreature+flying&order=cmc&dir=asc
```

---

#### Query Syntax

The `q` parameter supports space-separated tokens. All tokens must match (implicit AND). Prefix any token with `-` to negate it.

| Syntax | Aliases | Description | Example |
|---|---|---|---|
| `word` | | Card name, `oracle_text`, or `type_line` contains the word | `dragon` |
| `set:code` | | Card belongs to the given set | `set:digiMTG` |
| `t:value` | `type:value` | `type_line` contains the value | `t:creature`, `type:legendary` |
| `c:letters` | `color:letters` | Card's colors include the given letters (`W U B R G`) | `c:RG`, `color:W` |
| `c:C` | `color:colorless` | Card is colorless | `c:C` |
| `cmc:N` | `mv:N` | Converted mana cost equals `N` | `cmc:3`, `mv:0` |
| `-token` | | Negation of any token | `-t:creature`, `-flying` |

**Combined example:**

```
t:creature -t:legendary c:W cmc:3 vigilance
```
→ Non-legendary white creatures with CMC 3 that have Vigilance in their oracle text.

---

#### `GET /api/cards/autocomplete`

Returns up to 20 card names whose names **start with** the given prefix. Returns a Catalog object.

**Query params**

| Param | Description |
|---|---|
| `q` | Name prefix to complete (case-insensitive) |

**Response** `200`

```json
{
  "object": "catalog",
  "uri": "/api/cards/autocomplete?q=agu",
  "total_values": 3,
  "data": ["Agumon, Brave Rookie", "Agumon, SkullGreymon Mode", "Agumon X"]
}
```

An empty `q` returns an empty catalog (no error).

---

#### `GET /api/cards/:id`

Returns a single Card object directly (no wrapper).

**Path params**

| Param | Description |
|---|---|
| `id` | 12-character card ID |

**Responses**

- `200` — Card object
- `404` — Error object (`not_found`)

---

### Feedback

Feedback is a custom extension not present in Scryfall's API.

#### `GET /api/cards/:id/feedback`

Returns all feedback entries for a card.

**Response** `200`

```json
{
  "cardId": "a1b2c3d4e5f6",
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Alice",
      "rating": 5,
      "comment": "Great design!",
      "createdAt": "2026-03-05T12:00:00.000Z"
    }
  ]
}
```

---

#### `POST /api/cards/:id/feedback`

Submits a new feedback entry for a card.

**Request body** `application/json`

| Field | Type | Required | Constraints |
|---|---|---|---|
| `name` | `string` | Yes | 1–40 characters |
| `comment` | `string` | Yes | 1–2000 characters |
| `rating` | `number` | No | Integer 1–5 |

**Responses**

- `201` — `{ "ok": true, "entry": { ...FeedbackEntry } }`
- `404` — Error object (`not_found`) — card not found
- `422` — Error object (`bad_request`) — validation failure

---

### Images

Image endpoints serve files directly from `SETS_DIR/<code>/cards_images/`. Path traversal is blocked server-side.

#### `GET /api/sets/:setKey/images/:filename`

Serves the original image file at full resolution.

#### `GET /api/sets/:setKey/thumbnails/:filename`

Serves a **WebP thumbnail** resized to 280 px wide (aspect ratio preserved, quality 80). Thumbnails are generated on first request and cached permanently in `DATA_DIR/thumbs/<setKey>/`. Successful responses include `Cache-Control: public, max-age=31536000, immutable`.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `SETS_DIR` | `/sets` | Directory containing set folders |
| `DATA_DIR` | `/data` | Directory for feedback storage and thumbnail cache |
| `SCAN_INTERVAL_SECONDS` | `10` | How often to re-scan `SETS_DIR` for changes |

---

## Directory Layout

```
SETS_DIR/
└── <setCode>/
    ├── set.json          # Optional — { "title": "...", "description": "..." }
    ├── cards_json/       # One or more .json files
    │   └── cards.json    # Array, { cards: [...] }, or single card object
    └── cards_images/     # Card images — .png .jpg .jpeg .webp
        └── <CardName>.png
```

Image filenames are matched against the card name using a series of progressively normalized candidates (quote removal, illegal-character stripping, underscore/dash substitution, punctuation removal).
