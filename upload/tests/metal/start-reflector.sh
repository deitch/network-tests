#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption


# make sure an old one isn't running
pkill netserver || true

netserver -p $NETSERVERPORT >/dev/null
pgrep netserver
