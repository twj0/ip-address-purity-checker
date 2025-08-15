# 🔍 IP address purity check tool

based on Cloudflare Worker deployment, supports ProxyCheck.io professional detection algorithm, and provides complete subscription link management and automated detection functions.

## 🚀 One-click deployment

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/twj0/ip-address-purity-checker)

Click the button above and the deployment can be completed within a few minutes!


## 🛠️ Manual deployment

If you wish to deploy manually or customize the configuration:

### Step 1: Prepare the environment
```bash
npm install -g wrangler

wrangler --version
```

### Step 2: Log in to Cloudflare
```bash
wrangler login

wrangler whoami
```

### Step 3: Cloning and Deployment
```bash
git clone https://github.com/twj0/ip-address-purity-checker.git

cd ip-address-purity-checker

wrangler deploy

wrangler tail
```

### Step 4: Configure KV storage (optional)
```bash

wrangler kv namespace create "IP_CACHE"
# Copy the returned ID and update the KV configuration in wrangler.toml
wrangler deploy
```

> **Note**: KV storage is optional. Worker works fine without KV storage, but it cannot save detection history and subscription data.

## ⚙️ Configuration instructions

### API key configuration (optional but recommended)

In order to obtain higher detection accuracy (from 70% to 95%+), it is recommended to configure the API key:

1. **ProxyCheck.io API Key**
   - Free amount: 1000 times/day
   - Get the address: https://proxycheck.io/api/
   - Configure in the Settings tab of the web interface

2. **IPinfo.io Token**
   - Free amount: 50,000 times/month
   - Get the address: https://ipinfo.io/signup
   - Configure in the Settings tab of the web interface

### Subscription Management

1. Add your subscription link in the Subscription Management tab
2. The system will automatically parse and detect the IP address in it
3. Supports multiple subscription formats (Clash, V2Ray, Shadowsocks, etc.)
4. Data is stored securely in Cloudflare KV

## 📖 User Guide

### Single IP detection
1. Enter the IP address on the "Single IP Detection" tab
2. Click the "Detection IP" button
3. View detailed test results

### Batch inspection
1. Enter multiple IP addresses (one per line) on the "Batch Detection" tab page
2. Click the "Batch Detection" button
3. Wait for the detection to be completed and the CSV results can be exported

### Subscription Management
1. Add a subscription name and link
2. Click the "Test" button to verify the subscription
3. Use Check All Subscriptions for batch testing

### Timing tasks
- The system automatically performs detection at 00:00 Beijing time every day
- Check the execution status on the "Timed Tasks" tab
- Support manual trigger detection

