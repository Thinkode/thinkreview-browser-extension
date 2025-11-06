#!/bin/bash

# ThinkReview - Media Cleanup Script
# Keeps only essential screenshots, removes marketing materials

echo "🧹 Cleaning up media folder..."
echo "This will keep only essential screenshots for README"
echo ""

# Create backup
echo "📦 Creating backup..."
cp -r media/ media-backup/
echo "✅ Backup created at media-backup/"
echo ""

# Files to KEEP (essential for README)
KEEP_FILES=(
  "ThinkReview-Main-1.png"
  "thinkreview-azuredevops.gif"  
  "How-it-works2.gif"
)

echo "🗑️  Removing non-essential files..."

# Move to media directory
cd media/

# Remove everything except keep files and README.md
for file in *; do
  if [[ "$file" == "README.md" ]]; then
    continue
  fi
  
  # Check if file should be kept
  KEEP=0
  for keep in "${KEEP_FILES[@]}"; do
    if [[ "$file" == "$keep" ]]; then
      KEEP=1
      break
    fi
  done
  
  # Remove if not in keep list
  if [[ $KEEP -eq 0 ]]; then
    rm -rf "$file"
    echo "  ❌ Removed: $file"
  else
    echo "  ✅ Kept: $file"
  fi
done

cd ..

echo ""
echo "📊 Results:"
echo "Before: 29MB"
echo "After: $(du -sh media/ | cut -f1)"
echo ""
echo "✅ Cleanup complete!"
echo ""
echo "To undo: rm -rf media && mv media-backup media"
