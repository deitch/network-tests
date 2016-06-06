#!/bin/bash -x

set -e

docker stop netserver
docker rm netserver
