# TeraBox Folder Stream API

## Endpoints

- `GET /`
  - Returns a short JSON description of available endpoints.
- `GET /health`
  - Simple health check.
- `POST /folder`
  - Streams the file contents.

## Example Usage

### 1) List files in a folder

```bash
curl -X POST https://YOUR-DEPLOY-URL/folder \
  -H "Content-Type: application/json" \
```

### 2) Resolve a file by index

```bash
curl -X POST https://YOUR-DEPLOY-URL/resolve \
  -H "Content-Type: application/json" \

```

### 3) Stream the file

```bash
curl -L "PASTE_downloadUrl_FROM_RESOLVE" \

  -o file.bin
```
