const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { DateTime } = require('luxon');
const { HttpsProxyAgent } = require('https-proxy-agent');

class JetTON {
    headers() {
        return {
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "max-age=0",
            "Content-Type": "application/json",
            "Origin": "https://jettons.bot",
            "Priority": "u=1, i",
            "Sec-Ch-Ua": '"Not/A)Brand";v="8", "Chromium";v="126"',
            "Sec-Ch-Ua-Mobile": "?1",
            "Sec-Ch-Ua-Platform": '"Android"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.81 Mobile Safari/537.36"
        };
    }    

    log(msg) {
        console.log(`[*] ${msg}`);
    }

    async waitWithCountdown(seconds) {
        for (let i = seconds; i >= 0; i--) {
            const hours = Math.floor(i / 3600);
            const minutes = Math.floor((i % 3600) / 60);
            const secs = i % 60;
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`===== Chờ ${hours} giờ ${minutes} phút ${secs} giây để tiếp tục =====`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('');
    }

    async getUserData(init_data, proxy) {
        const url = "https://api.jettons.bot/api/tg_webapp/secure/get_user";
        const headers = this.headers();
        const payload = { init_data };

        try {
            const response = await axios.post(url, payload, {
                headers,
                httpsAgent: new HttpsProxyAgent(proxy)
            });
            return response.data;
        } catch (error) {
            this.log(`${'Lỗi khi lấy dữ liệu người dùng'.red}`);
            console.error(error);
            return null;
        }
    }

    async claimGame(init_data, proxy) {
        const url = "https://api.jettons.bot/api/tg_webapp/game/claim";
        const headers = this.headers();
        const payload = { init_data };

        try {
            const response = await axios.post(url, payload, {
                headers,
                httpsAgent: new HttpsProxyAgent(proxy)
            });
            if (response.data.success) {
                const gameState = response.data.game_state;
                const balance = gameState.balance;
                const lastFarmingStartAtUtc = DateTime.fromISO(gameState.last_farming_start_at_utc.$date, { zone: 'utc' });
                const nextFarmingTime = lastFarmingStartAtUtc.plus({ minutes: 30 }).setZone(DateTime.local().zoneName);

                this.log(`Claim thành công, balance: ${balance.toString().green}`);
                this.log(`Thời gian claim tiếp theo: ${nextFarmingTime.toLocaleString(DateTime.DATETIME_FULL).cyan}`);

                return nextFarmingTime;
            }
        } catch (error) {
            this.log(`${'Lỗi khi claim game'.red}`);
            console.error(error);
            return null;
        }
    }

    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', {
                httpsAgent: proxyAgent
            });
            if (response.status === 200) {
                return response.data.ip;
            } else {
                throw new Error(`Không thể kiểm tra IP của proxy. Status code: ${response.status}`);
            }
        } catch (error) {
            throw new Error(`Error khi kiểm tra IP của proxy: ${error.message}`);
        }
    }

    async main() {
        const dataFile = path.join(__dirname, 'data.txt');
        const proxyFile = path.join(__dirname, 'proxy.txt');
        
        const data = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);
            
        const proxies = fs.readFileSync(proxyFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        if (data.length !== proxies.length) {
            this.log(`${'Lỗi: Số lượng dữ liệu và proxy không khớp'.red}`);
            return;
        }

        let firstAccountNextFarmingTime = null;

        while (true) {
            for (let no = 0; no < data.length; no++) {
                const init_data = data[no];
                const proxy = proxies[no];
                try {
                    const userData = await this.getUserData(init_data, proxy);
                    if (userData && userData.user && userData.user.tg) {
                        const firstName = userData.user.tg.first_name;
                        const mainWalletBalance = userData.user.main_wallet_balance;

                        try {
                            const ip = await this.checkProxyIP(proxy);
                            console.log(`========== Tài khoản ${no + 1} | ${firstName.green} | IP: ${ip.white} ==========`);
                        } catch (proxyError) {
                            this.log(`${'Lỗi proxy, chuyển tài khoản tiếp theo'.red}`);
                            continue; 
                        }

                        this.log(`Balance: ${mainWalletBalance.toString().white}`.green);

                        const nextFarmingTime = await this.claimGame(init_data, proxy);
                        if (no === 0 && nextFarmingTime) {
                            firstAccountNextFarmingTime = nextFarmingTime;
                        }
                    } else {
                        this.log(`${'Lỗi: Không tìm thấy dữ liệu người dùng'.red}`);
                    }
                } catch (error) {
                    this.log(`${'Lỗi khi xử lý tài khoản'.red}`);
                }
            }

            if (firstAccountNextFarmingTime) {
                const now = DateTime.local();
                const waitTimeInSeconds = firstAccountNextFarmingTime.diff(now, 'seconds').seconds;
                await this.waitWithCountdown(Math.max(0, Math.floor(waitTimeInSeconds)));
            } else {
                await this.waitWithCountdown(15 * 60);
            }
        }
    }
}

if (require.main === module) {
    const jetton = new JetTON();
    jetton.main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}