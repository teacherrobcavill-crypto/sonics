#!/bin/bash
set -e

echo "Starting AAC (CoreAudio .m4a) conversion..."

# Convert full backing tracks
for f in public/audio/*.mp3; do
  [ -e "$f" ] || continue
  target="${f%.mp3}.m4a"
  echo "Encoding $f -> $target"
  /usr/bin/afconvert -d aac -f m4af -b 256000 -q 127 -s 2 "$f" "$target"
done

# Convert stems
for genre_dir in public/audio/stems/htdemucs/*; do
  if [ -d "$genre_dir" ]; then
    for stem in "$genre_dir"/*.mp3; do
      [ -e "$stem" ] || continue
      target="${stem%.mp3}.m4a"
      echo "Encoding stem $stem -> $target"
      /usr/bin/afconvert -d aac -f m4af -b 256000 -q 127 -s 2 "$stem" "$target"
    done
  fi
done

echo "All audio tracks and stems converted successfully to AAC (.m4a)!"
