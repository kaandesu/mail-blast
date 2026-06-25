#!/usr/bin/env bash

# CONFIG
GITHUB_TOKEN="github_pat_xxxxxxxxxxxxxxxxx"
OWNER="supabase"
REPO="supabase"

# START CLEAN
>users.txt

# GET LAST 100 STARGAZERS
curl -s -X POST https://api.github.com/graphql \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"query { repository(owner:\\\"$OWNER\\\", name:\\\"$REPO\\\") { stargazers(last:100) { edges { node { login } } } } }\"
  }" |
  jq -r '.data.repository.stargazers.edges[].node.login' |
  while read -r LOGIN; do
    EMAIL=$(curl -s \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$(jq -nc \
        --arg login "$LOGIN" \
        '{
        query: "query($login: String!) { user(login: $login) { email } }",
        variables: { login: $login }
      }')" \
      https://api.github.com/graphql |
      jq -r '.data.user.email // empty')

    if [ -n "$EMAIL" ]; then
      echo "$EMAIL" >>users.txt
      echo "FOUND $EMAIL"
    fi

    sleep 0.2
  done

sort -u users.txt -o users.txt

echo "Done. Saved $(wc -l <users.txt) emails to users.txt"
