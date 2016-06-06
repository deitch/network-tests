#!/bin/bash

set -e

docker run -it -d --net=none --name=netperf netperf sh

