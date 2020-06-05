# ![](penguin-development.svg) Penguin

This is the development branch

A simple sample browser made with electron

## Contents
* [Getting Started](#getting-started)
	* [Prerequisites](#prerequisites)
	* [Installing](#installing)

## Getting Started
Prebuilt binaries can be found under [releases](https://github.com/Dougal-s/Penguin/releases)
### Prerequisites
* git
* npm

#### Ubuntu/Debian:
```
sudo apt install git npm

```
### Installing
First clone the repository by running:
```
git clone https://github.com/Dougal-s/Penguin.git
cd Penguin
```
Install the required dependencies and build the installer by running:
```
npm install
npm run build
```
Locate and run the execute the installer located in dist.

Penguin can also be run by without being installed for development purposes by executing:
```
npm start
```
