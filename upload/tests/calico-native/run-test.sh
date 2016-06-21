#!/bin/bash

set -e

npname=netperf-$(hostname)

docker exec -i $npname $@
docker kill $npname >/dev/null 2>&1
docker rm $npname >/dev/null 2>&1
