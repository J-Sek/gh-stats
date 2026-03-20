#!/bin/sh
DATE="2026-03-19"
echo "Issues created on $DATE:"
gh api "search/issues?q=repo:vuetifyjs/vuetify+is:issue+created:$DATE&per_page=1" --jq '.total_count'
echo "Issues closed on $DATE:"
gh api "search/issues?q=repo:vuetifyjs/vuetify+is:issue+closed:$DATE&per_page=1" --jq '.total_count'
