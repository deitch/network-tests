#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

docker run --rm --net=host netperf netperf  -P 0 -H $TARGET -c -t ${PROTOCOL}_RR -l -${REPS} -v 2 -p $CONTROLPORT -- -k -r ${SIZE},${SIZE} -P ${LOCALPORT},${REMOTEPORT}

