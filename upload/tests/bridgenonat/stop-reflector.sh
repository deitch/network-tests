#!/bin/bash -x

set -e

docker kill netserver
docker rm netserver
