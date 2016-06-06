#!/bin/bash

set -e

docker exec -i netperf netperf  -P 0 -H $1 -c -t $2_RR -l -$3 -v 2 -p $4 -- -k -r $5,$5 -P $6,$7
docker kill netperf >/dev/null 2>&1
docker rm netperf >/dev/null 2>&1

