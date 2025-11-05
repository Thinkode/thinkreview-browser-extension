#!/bin/bash

# Script to generate multiple icon sizes using ImageMagick
# Usage: ./generate_icons.sh <input_image_name>

# Check if an argument is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <input_image_name>"
  exit 1
fi

INPUT_IMAGE="$1"

# Output directory for icons
OUTPUT_DIR="icons"
mkdir -p "$OUTPUT_DIR"

# Generate icon sizes using ImageMagick
declare -a sizes=("16" "32" "48" "64" "128" "192")
for size in "${sizes[@]}"; do
  OUTPUT_FILE="$OUTPUT_DIR/icon${size}.png"
  if magick "$INPUT_IMAGE" -resize "${size}x${size}" "$OUTPUT_FILE"; then
    echo "Generated $OUTPUT_FILE"
  else
    echo "Failed to generate $OUTPUT_FILE"
    exit 1
  fi
done

# Print completion message
echo "Icons generated successfully in the $OUTPUT_DIR directory."


