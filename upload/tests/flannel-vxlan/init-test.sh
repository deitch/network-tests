#!/bin/bash

set -e

cid=$(docker run -t -d --name=netperf netperf sh)

