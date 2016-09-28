#!/bin/bash

set -e

docker kill netperf >/dev/null 2>&1
docker rm netperf >/dev/null 2>&1


