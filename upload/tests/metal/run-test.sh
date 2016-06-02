#!/bin/bash

set -e

netperf  -P 0 -H $1 -c -t $2_RR -l -$3 -v 2 -p $4 -- -k -r $5,$5 -P $6,$7

