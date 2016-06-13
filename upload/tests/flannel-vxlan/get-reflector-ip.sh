#!/bin/bash

set -e

localIP=$(docker inspect --format '{{ .NetworkSettings.IPAddress }}' netserver)

echo $localIP $localIP
