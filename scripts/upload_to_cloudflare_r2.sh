#!/bin/bash
set -e

# Cloudflare R2 Bucket configuration
# Replace BUCKET_NAME with your bucket name if different from 'sonics'
BUCKET_NAME="${1:-sonics}"

echo "Checking Cloudflare Wrangler authentication..."
if ! npx wrangler whoami > /dev/null 2>&1; then
  echo "Error: Wrangler is not authenticated."
  echo "Please run: npx wrangler login"
  exit 1
fi

echo "Uploading high-bitrate AAC audio to Cloudflare R2 bucket: $BUCKET_NAME"

# Upload full tracks
for f in public/audio/*.m4a; do
  [ -e "$f" ] || continue
  filename=$(basename "$f")
  echo "Uploading $filename..."
  npx wrangler r2 object put "$BUCKET_NAME/$filename" --file="$f" --content-type="audio/mp4"
done

# Upload Demucs stems
for genre_dir in public/audio/stems/htdemucs/*; do
  if [ -d "$genre_dir" ]; then
    genre=$(basename "$genre_dir")
    for stem in "$genre_dir"/*.m4a; do
      [ -e "$stem" ] || continue
      stemfile=$(basename "$stem")
      key="stems/htdemucs/$genre/$stemfile"
      echo "Uploading $key..."
      npx wrangler r2 object put "$BUCKET_NAME/$key" --file="$stem" --content-type="audio/mp4"
    done
  fi
done

echo "Cloudflare R2 upload complete!"
