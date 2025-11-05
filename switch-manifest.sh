#!/bin/bash

# Script to switch between development and production manifest files
# Usage: ./switch-manifest.sh [dev|prod]

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if argument is provided
if [ $# -eq 0 ]; then
  echo -e "${RED}Error: No argument provided${NC}"
  echo -e "Usage: ./switch-manifest.sh [dev|prod]"
  exit 1
fi

# Switch based on argument
case "$1" in
  dev)
    echo -e "${YELLOW}Switching to development manifest...${NC}"
    cp manifest.dev.json manifest.json
    echo -e "${GREEN}Now using development manifest!${NC}"
    ;;
  prod)
    echo -e "${YELLOW}Switching to production manifest...${NC}"
    cp manifest.prod.json manifest.json
    echo -e "${GREEN}Now using production manifest!${NC}"
    ;;
  *)
    echo -e "${RED}Invalid argument: $1${NC}"
    echo -e "Usage: ./switch-manifest.sh [dev|prod]"
    exit 1
    ;;
esac

# Make a backup of the current manifest
cp manifest.json manifest.current.json
echo -e "${GREEN}Backup created as manifest.current.json${NC}"

echo -e "${YELLOW}Don't forget to reload the extension in Chrome!${NC}"
