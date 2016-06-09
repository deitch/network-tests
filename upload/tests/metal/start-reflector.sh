#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption


netserver -p $NETSERVERPORT >/dev/null
pgrep netserver
