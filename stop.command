#!/bin/bash
# Double-click to stop the local server on port 3000.
pids=$(lsof -ti tcp:3000)
if [ -z "$pids" ]; then
  echo "Nothing is listening on port 3000."
else
  kill $pids && echo "Stopped the server on port 3000."
fi
sleep 1
