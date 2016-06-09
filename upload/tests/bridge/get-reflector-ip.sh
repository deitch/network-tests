#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

localIP=$(docker inspect --format '{{ .NetworkSettings.IPAddress }}' netserver)
remoteIP=${PRIVATEIPS[1]}

echo $localIP $remoteIP
