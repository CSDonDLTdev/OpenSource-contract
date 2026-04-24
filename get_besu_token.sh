#!/bin/bash

# Check if URL is provided as an argument
if [ -z "$1" ]; then
    echo "Usage: $0 <login_url>"
    exit 1
fi

LOGIN_URL="$1"

# Load .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo ".env file not found"
    exit 1
fi

# Check if credentials are set
if [ -z "$BESU_USERNAME" ] || [ -z "$BESU_PASSWORD" ]; then
    echo "BESU_USERNAME or BESU_PASSWORD not set in .env file"
    exit 1
fi

# Get token using curl
response=$(curl --silent --location "$LOGIN_URL/login" \
  --header 'Content-Type: application/json' \
  --data "{\"username\":\"$BESU_USERNAME\",\"password\":\"$BESU_PASSWORD\"}")

# Extract token from response
token=$(echo "$response" | jq -r '.token')

# Check if token was received
if [ -z "$token" ] || [ "$token" == "null" ]; then
    echo "Failed to retrieve token. Response was: $response"
    exit 1
fi

# Update or add BESU_TOKEN in .env file
if grep -q '^BESU_TOKEN=' .env; then
    sed -i "s/^BESU_TOKEN=.*/BESU_TOKEN=$token/" .env
else
    echo -e "\nBESU_TOKEN=$token" >> .env
fi

echo "Token saved to .env as BESU_TOKEN"
