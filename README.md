# TeraBox Folder Stream API

## Endpoints

- `GET /`
  - Returns a short JSON description of available endpoints.
- `GET /health`
  - Simple health check.
- `POST /folder`
  - Body: `{ "url": "<folder share link>" }`
  - Returns: `{ ok, count, files: [{ id, name, size, directUrl }] }`
- `POST /resolve`
  - Body: `{ "url": "<folder share link>", "pick": 0 }`
  - Returns: `{ ok, name, size, mime, downloadUrl }`
- `GET /stream?url=<directUrl>`
  - Streams the file contents.

## Example Usage

### 0) Configure the cookie (required)

Set an environment variable named `TERABOX_COOKIE` on your host (or Railway) with the full
`document.cookie` string.

### 1) List files in a folder

```bash
curl -X POST https://YOUR-DEPLOY-URL/folder \
  -H "Content-Type: application/json" \
  -d '{"url":"PASTE_FOLDER_LINK"}'
```

### 2) Resolve a file by index

```bash
curl -X POST https://YOUR-DEPLOY-URL/resolve \
  -H "Content-Type: application/json" \
  -d '{"url":"PASTE_FOLDER_LINK","pick":0}'

```

### 3) Stream the file

```bash
curl -L "PASTE_downloadUrl_FROM_RESOLVE" \

  -o file.bin
```
