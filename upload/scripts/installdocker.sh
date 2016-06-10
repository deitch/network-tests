#!/bin/bash

set -e

if command -v "docker" > /dev/null 2>&1; then
	yum update docker
else 
	curl -fsSL https://get.docker.com/ | sh
fi

systemctl start docker


