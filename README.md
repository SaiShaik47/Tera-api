# TeraBox Folder Stream API

## Endpoints

- `GET /`
  - Returns a short JSON description of available endpoints.
- `GET /health`
  - Simple health check.
- `POST /folder`
  - Body: `{ "url": "<folder share link>", "cookie": "<document.cookie>" }`
  - Returns: `{ ok, count, files: [{ id, name, size, directUrl }] }`
- `POST /resolve`
  - Body: `{ "url": "<folder share link>", "cookie": "<document.cookie>", "pick": 0 }`
  - Returns: `{ ok, name, size, mime, downloadUrl }`
- `GET /stream?url=<directUrl>`
  - Header: `x-cookie: <document.cookie>`
  - Streams the file contents.

## Example Usage

### 1) List files in a folder

```bash
curl -X POST https://YOUR-DEPLOY-URL/folder \
  -H "Content-Type: application/json" \
  -d '{"url":"PASTE_FOLDER_LINK","cookie":"PASTE_COOKIE"}'
```

### 2) Resolve a file by index

```bash
curl -X POST https://YOUR-DEPLOY-URL/resolve \
  -H "Content-Type: application/json" \
  -d '{"url":"PASTE_FOLDER_LINK","cookie":"PASTE_COOKIE","pick":0}'
```

### 3) Stream the file

```bash
curl -L "PASTE_downloadUrl_FROM_RESOLVE" \
  -H "x-cookie: PASTE_COOKIE" \
  -o file.bin
```
