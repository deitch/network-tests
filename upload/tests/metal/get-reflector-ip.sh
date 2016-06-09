#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common

. $COMMON/getoption

localIP=${PRIVATEIPS[1]}
remoteIP=${PRIVATEIPS[1]}

echo $localIP $remoteIP