#!/bin/bash

set -e


# make sure an old one isn't running
pkill netserver || true

netserver -p $NETSERVERPORT >/dev/null
pgrep netserver
