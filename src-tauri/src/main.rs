#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde_json::{self, json, Value};
use ssh2::{DisconnectCode, Session};
use std::{
    io::{prelude::Read, Write},
    thread, time,
};
use tauri::{LogicalSize, Manager};

struct SessionManager {
    open_session: Session,
    stop_cpu_mem_sync: bool,
    walletpassword: String,
}

static mut GLOBAL_STRUCT: Option<SessionManager> = None;

#[tauri::command(async)]
async fn log_in(ip: String, password: String, remember: bool, window: tauri::Window) {
    let tcp = std::net::TcpStream::connect(format!("{ip}:22")).unwrap();
    tcp.set_read_timeout(Some(std::time::Duration::from_secs(1)))
        .unwrap();
    let mut sess = Session::new().unwrap();
    sess.set_tcp_stream(tcp);
    sess.handshake().unwrap();
    let res = sess.userauth_password("root", &password);

    let client = reqwest::Client::new();
    let auth_response = client
        .post("https://admin.node101.io/api/authenticate")
        .json(&json!({ "key": "b8737b4ca31571d769506c4373f5c476e0a022bf58d5e0595c0e37eabb881ad150b8c447f58d5f80f6ffe5ced6f21fe0502c12cf32ab33c6f0787aea5ccff153" }))
        .send().await.unwrap();
    let cookie = auth_response
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap();

    let mut projects_data: Vec<Vec<(String, String)>> = Vec::new();
    let mut page_num = 0;
    loop {
        let page_data = client
            .get(format!(
                "https://admin.node101.io/api/projects?page={page_num}"
            ))
            .header("Cookie", cookie)
            .send()
            .await
            .unwrap();
        let v: Value = serde_json::from_str(&page_data.text().await.unwrap()).unwrap();
        let page_data: Vec<(String, String)> = v["projects"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| {
                (
                    p.get("name").and_then(Value::as_str).unwrap().to_owned(),
                    p.get("wizard_key")
                        .map(|v| v.to_string().replace("\"", ""))
                        .unwrap(),
                )
            })
            .collect();

        if page_data.is_empty() {
            break;
        }
        projects_data.push(page_data);
        page_num += 1;
    }

    if res.is_ok() {
        unsafe {
            GLOBAL_STRUCT = Some(SessionManager {
                open_session: sess,
                stop_cpu_mem_sync: false,
                walletpassword: String::new(),
            });

            if let Some(my_boxed_session) = GLOBAL_STRUCT.as_mut() {
                let mut channel = my_boxed_session.open_session.channel_session().unwrap();
                channel.exec("bash -c -l 'echo $EXECUTE'").unwrap();
                let mut s = String::new();
                channel.read_to_string(&mut s).unwrap();

                let mut found = false;
                for page_data in projects_data {
                    for item in page_data {
                        if s.trim() == item.1 {
                            println!("Found project: {}", item.0);
                            window
                                .eval(&format!(
                                    "window.loadNewPage('manage-node/manage-node.html', {}, '{}')",
                                    remember, item.0
                                ))
                                .unwrap();
                            found = true;
                            break;
                        }
                    }
                    if found {
                        break;
                    }
                }
                if !found {
                    window
                        .eval(&format!(
                            "window.loadNewPage('home-page/home-page.html', {remember}, '')"
                        ))
                        .unwrap();
                }

                channel.close().unwrap();
                // check_if_password_needed();
            }
        }
    } else {
        window.eval("window.showLoginError()").unwrap();
    }
}

#[tauri::command(async)]
fn log_out() {
    unsafe {
        if let Some(my_boxed_session) = GLOBAL_STRUCT.as_ref() {
            (*my_boxed_session)
                .open_session
                .disconnect(
                    Some(DisconnectCode::AuthCancelledByUser),
                    "Disconnecting from server",
                    None,
                )
                .unwrap();

            GLOBAL_STRUCT = None;
        }
    }
}

#[tauri::command(async)]
fn cpu_mem_sync_stop() {
    unsafe {
        if let Some(my_boxed_session) = GLOBAL_STRUCT.as_mut() {
            my_boxed_session.stop_cpu_mem_sync = true;
        }
    }
}

#[tauri::command(async)]
async fn cpu_mem_sync(window: tauri::Window) {
    unsafe {
        if let Some(my_boxed_session) = GLOBAL_STRUCT.as_mut() {
            my_boxed_session.stop_cpu_mem_sync = false;
            loop {
                if my_boxed_session.stop_cpu_mem_sync {
                    break;
                }
                let channel_result = my_boxed_session.open_session.channel_session();
                let mut channel = match channel_result {
                    Ok(channel) => channel,
                    Err(err) => {
                        println!("Error opening channel: {}", err);
                        window.eval("message('Session timed out, please log in again.', { title: 'Error', type: 'error' }); window.location.href = '../index.html';").unwrap();
                        return;
                    }
                };
                let mut s = String::new();
                channel.exec("export PATH=$PATH:/usr/local/go/bin:/root/go/bin; echo $(top -b -n1 | awk '/Cpu\\(s\\)/{{print 100-$8}} /MiB Mem/{{print ($4-$6)/$4*100}}'; echo \\'$(systemctl is-active $(bash -c -l 'echo $EXECUTE'))\\'; $(bash -c -l 'echo $EXECUTE') status 2>&1 | jq .SyncInfo.latest_block_height,.SyncInfo.catching_up,.NodeInfo.version)").unwrap();
                channel.read_to_string(&mut s).unwrap();
                println!("{}", s);
                window
                    .eval(&*format!(
                        "window.updateCpuMemSync({});",
                        s.trim().split_whitespace().collect::<Vec<&str>>().join(",")
                    ))
                    .unwrap();
                channel.close().unwrap();
                thread::sleep(time::Duration::from_secs(5));
            }
        }
    }
}

// #[tauri::command(async)]
// fn update_node(node_name: String) {
//     unsafe {
//         if let Some(my_boxed_session) = GLOBAL_STRUCT.as_mut() {
//             let mut channel = my_boxed_session.open_session.channel_session().unwrap();
//             channel
//                 .exec(&format!(
//                     "export PATH=$PATH:/usr/local/go/bin:/root/go/bin; {node_name} version;"
//                 ))
//                 .unwrap();
//             let mut current_version = String::new();
//             channel.read_to_string(&mut current_version).unwrap();
//             channel.flush().unwrap();
//             println!("{}", current_version);
//             let mut channel1 = my_boxed_session.open_session.channel_session().unwrap();
//             let mut repo = String::new();
//             channel1
//                 .exec(&format!("grep 'REPO=' .bash_profile | sed 's/^.*: //"))
//                 .unwrap();
//             channel1.read_to_string(&mut repo).unwrap();
//             println!("ASDAS {}", repo);
//             // let url = "https://api.github.com/repos/confio/tgrade/releases";
//             // let releases: Vec<Release> = reqwest::get(url).await?.json().await?;
//             // if releases.is_empty() {
//             //     println!("No releases found in the repository.");
//             // } else {
//             //     let latest_stable_release = releases
//             //         .into_iter()
//             //         .find(|release| !release.prerelease);
//             //     match latest_stable_release {
//             //         Some(release) => println!("Latest stable release: {}", release.tag_name),
//             // None => println!("No stable releases found in the repository."),
//         }
//     }
// }

#[tauri::command(async)]
fn node_info(window: tauri::Window) {
    unsafe {
        if let Some(my_boxed_session) = GLOBAL_STRUCT.as_mut() {
            let mut channel = my_boxed_session.open_session.channel_session().unwrap();
            channel
                .exec(&format!("export PATH=$PATH:/usr/local/go/bin:/root/go/bin; $(bash -c -l 'echo $EXECUTE') status 2>&1 | jq"))
                .unwrap();
            let mut s = String::new();
            channel.read_to_string(&mut s).unwrap();
            window
                .eval(&*format!("window.updateNodeInfo({})", s))
                .unwrap();
            channel.close().unwrap();
        }
    }
}

// #[tauri::command(async)]
// fn systemctl_statusnode(node_name: String) {
//     unsafe {
//         if let Some(my_boxed_session) = GLOBAL_STRUCT.as_mut() {
//             let mut channel = my_boxed_session.open_session.channel_session().unwrap();
//             channel
//                 .exec(&format!(
//                     "export PATH=$PATH:/usr/local/go/bin:/root/go/bin; systemctl status {node_name};"
//                 ))
//                 .unwrap();
//             let mut s = String::new();
//             channel.read_to_string(&mut s).unwrap();
//             println!("{}", s);
//             channel.close().unwrap();
//         }
//     }
// }

#[tauri::command(async)]
fn delete_node() {
    unsafe {
        if let Some(my_boxed_session) = GLOBAL_STRUCT.as_mut() {
            let mut channel = my_boxed_session.open_session.channel_session().unwrap();

            channel
                .exec(&format!(
                    "bash -c -l \"sudo systemctl stop $EXECUTE; sudo systemctl disable $EXECUTE; sudo rm -rf /etc/systemd/system/$EXECUTE* $(which $EXECUTE) $SYSTEM_FOLDER $HOME/$SYSTEM_FILE* $HOME/$EXECUTE*; sed -i '/EXECUTE/d; /CHAIN_ID/d; /PORT/d; /DENOM/d; /SEEDS/d; /PEERS/d; /VERSION/d; /SYSTEM_FOLDER/d; /PROJECT_FOLDER/d; /GO_VERSION/d; /GENESIS_FILE/d; /ADDRBOOK/d; /MIN_GAS/d; /SEED_MODE/d; /PATH/d; /REPO/d; /MONIKER/d; /SNAPSHOT_URL/d; /WALLET_NAME/d' ~/.bash_profile; source .bash_profile; unset EXECUTE CHAIN_ID PORT DENOM SEEDS PEERS VERSION SYSTEM_FOLDER PROJECT_FOLDER GO_VERSION GENESIS_FILE ADDRBOOK MIN_GAS SEED_MODE PATH REPO MONIKER SNAPSHOT_URL WALLET_NAME\""
                ))
                .unwrap();
            let mut s = String::new();
            channel.read_to_string(&mut s).unwrap();
            println!("{}", s);
            channel.close().unwrap();
        }
    }
}

// #[tauri::command(async)]
// fn create_validator(
//     amount: String,
//     wallet_name: String,
//     moniker_name: String,
//     password: String,
//     website: String,
//     keybase_id: String,
//     contact: String,
//     com_rate: String,
//     com_max: String,
//     com_ch_rate: String,
//     fees: String,
//     details: String,
// ) {
//     unsafe {
//         if let Some(my_boxed_session) = GLOBAL_STRUCT.as_mut() {
//             let mut channel = my_boxed_session.open_session.channel_session().unwrap();
//             let mut s = String::new();
//             channel.exec(&format!("export PATH=$PATH:/usr/local/go/bin:/root/go/bin; yes \"{password}\" | $(bash -c -l 'echo $EXECUTE') tx staking create-validator --amount={amount}$DENOM --pubkey=$($EXECUTE tendermint show-validator) --moniker={moniker_name}  --chain-id=$CHAIN_ID --commission-rate={com_rate} --commission-max-rate={com_max} --commission-max-change-rate={com_ch_rate} --gas='auto' --gas-prices='{fees}$DENOM' --from={wallet_name} --website={website} --identity={keybase_id} --conta ")).unwrap();
//             channel.read_to_string(&mut s).unwrap();
//             println!("{}", s);
//             channel.close().unwrap();
//         }
//     }
// }

// #[tauri::command(async)]
// fn edit_validator(
//     amount: String,
//     wallet_name: String,
//     moniker_name: String,
//     password: String,
//     website: String,
//     keybase_id: String,
//     contact: String,
//     com_rate: String,
//     com_max: String,
//     com_ch_rate: String,
//     fees: String,
//     details: String,
// ) {
//     unsafe {
//         if let Some(my_boxed_session) = GLOBAL_STRUCT.as_mut() {
//             let mut channel = my_boxed_session.open_session.channel_session().unwrap();
//             let mut s = String::new();
//             channel.exec(&format!("export PATH=$PATH:/usr/local/go/bin:/root/go/bin; yes \"{password}\" | $EXECUTE tx staking edit-validator --amount={amount}$DENOM --pubkey=$($EXECUTE tendermint show-validator) --moniker={moniker_name}  --chain-id=$CHAIN_ID --commission-rate={com_rate} --commission-max-rate={com_max} --commission-max-change-rate={com_ch_rate} --gas='auto' --gas-prices='{fees}$DENOM' --from={wallet_name} --website={website} --identity={keybase_id} --conta ")).unwrap();
//             channel.read_to_string(&mut s).unwrap();
//             println!("{}", s);
//             channel.close().unwrap();
//         }
//     }
// }

// #[tauri::command(async)]
// fn withdraw_rewards(wallet_name: String, valoper: String, fees: String, password: String) {
//     unsafe {
//         if let Some(my_boxed_session) = GLOBAL_STRUCT.as_ref() {
//             let mut channel = my_boxed_session.open_session.channel_session().unwrap();
//             channel.exec(&format!(
//                 "export PATH=$PATH:/usr/local/go/bin:/root/go/bin; yes \"{password}\" | $EXECUTE tx distribution withdraw-rewards {valoper} --from={wallet_name} --commission --chain-id=$CHAIN_ID;")).unwrap();
//             let mut s = String::new();
//             channel.read_to_string(&mut s).unwrap();
//             println!("{}", s);
//             channel.close().unwrap();
//         }
//     }
// }

// #[tauri::command(async)]
// fn delegate_token(
//     wallet_name: String,
//     valoper: String,
//     password: String,
//     fee: String,
//     amount: String,
// ) {
//     unsafe {
//         if let Some(my_boxed_session) = GLOBAL_STRUCT.as_ref() {
//             let mut channel = my_boxed_session.open_session.channel_session().unwrap();
//             channel.exec(&format!(
//                 "export PATH=$PATH:/usr/local/go/bin:/root/go/bin; yes \"{password}\" | $EXECUTE tx staking delegate {valoper} {amount}$DENOM --from={wallet_name} --chain-id=$CHAIN_ID --gas='auto' --fees={fee}$DENOM ;")).unwrap();
//             let mut s = String::new();
//             channel.read_to_string(&mut s).unwrap();
//             // println!("{}", s);
//             channel.close().unwrap();
//         }
//     }
// }

// #[tauri::command(async)]
// fn redelegate_token(
//     wallet_name: String,
//     first_address: String,
//     destination: String,
//     valoper: String,
//     password: String,
//     fee: String,
//     amount: String,
// ) {
//     unsafe {
//         if let Some(my_boxed_session) = GLOBAL_STRUCT.as_ref() {
//             let mut channel = my_boxed_session.open_session.channel_session().unwrap();
//             let command: String = format!(
//                 "export PATH=$PATH:/usr/local/go/bin:/root/go/bin; yes \"{password}\" | $EXECUTE tx staking rewdelegate {first_address} {destination} {amount}$DENOM --from={wallet_name} --chain-id=$CHAIN_ID --gas='auto' --fees={fee}$DENOM ;");
//             channel.exec(&*command).unwrap();
//             let mut s = String::new();
//             channel.read_to_string(&mut s).unwrap();
//             // println!("{}", s);
//             channel.close().unwrap();
//         }
//     }
// }

#[tauri::command(async)]
fn install_node(window: tauri::Window) {
    unsafe {
        if let Some(my_boxed_session) = GLOBAL_STRUCT.as_ref() {
            let mut channel = my_boxed_session.open_session.channel_session().unwrap();
            channel.exec(&format!("echo 'export MONIKER=node101' >> $HOME/.bash_profile; echo 'export WALLET_NAME=node101' >> $HOME/.bash_profile; wget -O lava.sh https://node101.io/testnet/lava-testnet1/lava.sh && chmod +x lava.sh && bash lava.sh")).unwrap();
            let mut buf = [0u8; 1024];
            loop {
                let len = channel.read(&mut buf).unwrap();
                if len == 0 {
                    break;
                }
                let s = std::str::from_utf8(&buf[0..len]).unwrap();
                println!("{}", s);
                if s.contains("SETUP IS FINISHED") {
                    window.eval("endInstallation();").unwrap();
                }
                std::io::stdout().flush().unwrap();
            }
            println!("çıktık");
            channel.close().unwrap();
        }
    }
}

#[tauri::command(async)]
fn check_if_password_needed() {
    unsafe {
        if let Some(my_boxed_session) = GLOBAL_STRUCT.as_ref() {
            let mut channel = my_boxed_session.open_session.channel_session().unwrap();
            channel
                .exec(&format!("bash -c -l '$EXECUTE keys add testforpassword'"))
                .unwrap();
            let mut buf = [0u8; 1024];
            loop {
                let len = channel.read(&mut buf).unwrap();
                if len == 0 {
                    break;
                }
                let s = std::str::from_utf8(&buf[0..len]).unwrap();
                println!("{}", s);
                // if s.contains("SETUP IS FINISHED") {
                //     println!("SETUP IS FINISHED");
                //     window.eval("endInstallation();").unwrap();
                // }
                std::io::stdout().flush().unwrap();
            }
            println!("çıktık");
            channel.close().unwrap();
        }
    }
}

#[tauri::command]
fn update_wallet_password(passw: String) {
    unsafe {
        GLOBAL_STRUCT.as_mut().unwrap().walletpassword = passw.to_string();
    }
}

#[tauri::command(async)]
fn create_wallet(walletname: String, window: tauri::Window) {
    unsafe {
        if let Some(my_boxed_session) = GLOBAL_STRUCT.as_ref() {
            let mut channel = my_boxed_session.open_session.channel_session().unwrap();
            let mut s = String::new();
            channel
                .exec(&*format!(
                    "echo -e '{}\ny\n' | bash -c -l '$EXECUTE keys add {} --output json'",
                    my_boxed_session.walletpassword, walletname
                ))
                .unwrap();
            channel.read_to_string(&mut s).unwrap();
            println!("aaa{}", s);
            let v: Value = serde_json::from_str(&s).unwrap();
            window
                .eval(&format!(
                    "window.showCreatedWallet('{}')",
                    v["mnemonic"].to_string()
                ))
                .unwrap();
            channel.close().unwrap();
        }
    }
}

#[tauri::command(async)]
fn if_wallet_exists(walletname: String) -> bool {
    unsafe {
        if let Some(my_boxed_session) = GLOBAL_STRUCT.as_ref() {
            let mut channel = my_boxed_session.open_session.channel_session().unwrap();
            let command: String = format!(
                "echo -e {} | bash -c -l '$EXECUTE keys list --output json'",
                GLOBAL_STRUCT.as_mut().unwrap().walletpassword,
            );
            channel.exec(&*command).unwrap();
            let mut s = String::new();
            channel.read_to_string(&mut s).unwrap();
            let v: Value = serde_json::from_str(&s).unwrap();
            let mut is_exist = false;
            for i in v.as_array().unwrap() {
                if i["name"].to_string() == format!("\"{}\"", walletname) {
                    is_exist = true;
                }
            }
            channel.close().unwrap();
            is_exist
        } else {
            false
        }
    }
}

#[tauri::command(async)]
fn show_wallets(window: tauri::Window) {
    unsafe {
        if let Some(my_boxed_session) = GLOBAL_STRUCT.as_ref() {
            let mut channel = my_boxed_session.open_session.channel_session().unwrap();
            let command: String = format!(
                "yes \"{}\" | bash -c -l '$EXECUTE keys list --output json'",
                GLOBAL_STRUCT.as_mut().unwrap().walletpassword,
            );
            channel.exec(&*command).unwrap();
            let mut s = String::new();
            channel.read_to_string(&mut s).unwrap();
            window.eval(&format!("window.showWallets({})", s)).unwrap();
            channel.close().unwrap();
        }
    }
}

#[tauri::command(async)]
fn delete_wallet(walletname: String) -> () {
    unsafe {
        if let Some(my_boxed_session) = GLOBAL_STRUCT.as_ref() {
            let mut channel = my_boxed_session.open_session.channel_session().unwrap();
            let command: String = format!(
                "yes \"{}\" | bash -c -l '$EXECUTE keys delete {} -y --output json'",
                GLOBAL_STRUCT.as_mut().unwrap().walletpassword,
                walletname
            );
            channel.exec(&*command).unwrap();
            let mut s = String::new();
            channel.read_to_string(&mut s).unwrap();
            println!("{}", s);
            channel.close().unwrap();
        }
    }
}

#[tauri::command(async)]
fn start_stop_restart_node(action: String) {
    unsafe {
        if let Some(my_boxed_session) = GLOBAL_STRUCT.as_mut() {
            let mut channel = my_boxed_session.open_session.channel_session().unwrap();
            let command: String = format!("bash -c -l 'systemctl {action} $EXECUTE'");
            channel.exec(&*command).unwrap();
            channel.close().unwrap();
        }
    }
}

// #[tauri::command(async)]
// fn unjail(password: String, fees: String) {
//     unsafe {
//         if let Some(my_boxed_session) = GLOBAL_STRUCT.as_ref() {
//             let mut channel = my_boxed_session.open_session.channel_session().unwrap();
//             // let nd = &my_boxed_session.existing_node;
//             // let command: String = format!(
//             //     "yes \"{password}\" | export PATH=$PATH:/usr/local/go/bin:/root/go/bin; {nd} tx slashing unjail  --broadcast-mode=block --from=$WALLET_NAME --chain-id=$CHAIN_ID --gas=auto --fees {fees}$DENOM"
//             // );
//             // channel.exec(&command).unwrap();
//             let mut s = String::new();
//             channel.read_to_string(&mut s).unwrap();
//             println!("{}", s);
//             println!("Will return mnemonics if created first, if not then will return a success or anything.");
//             channel.close().unwrap();
//         }
//     }
// }

#[tauri::command(async)]
fn recover_wallet(walletname: String, mnemo: String) {
    unsafe {
        if let Some(my_boxed_session) = GLOBAL_STRUCT.as_ref() {
            let mut channel = my_boxed_session.open_session.channel_session().unwrap();
            let mut s = String::new();
            channel
                .exec(
                    &*format!("echo -e '{}\n{}\n' | bash -c -l '$EXECUTE keys add {} --recover --output json'", // PAROLA İSTEMEYENLERDE ÇALIŞMIYOR!!!
                    my_boxed_session.walletpassword,
                    mnemo,
                    walletname
                ),
                )
                .unwrap();
            channel.read_to_string(&mut s).unwrap();
            println!("hahaha{}", s);
            channel.close().unwrap();
        }
    }
}

// #[tauri::command(async)]
// fn vote(wallet_name: String, password: String, proposal_num: String, option: String) {
//     unsafe {
//         if let Some(my_boxed_session) = GLOBAL_STRUCT.as_ref() {
//             let mut channel = my_boxed_session.open_session.channel_session().unwrap();
//             let command: String = format!("yes \"{password}\" $EXECUTE tx gov vote {proposal_num} {option} --from {wallet_name} --chain-id=$CHAIN_ID -y");
//             channel.exec(&command).unwrap();
//             let mut s = String::new();
//             channel.read_to_string(&mut s).unwrap();
//             println!("{}", s);
//             channel.close().unwrap();
//         }
//     }
// }

// #[tauri::command(async)]
// fn send_token(wallet_name: String, receiver_address: String, amount: String, password: String) {
//     unsafe {
//         if let Some(my_boxed_session) = GLOBAL_STRUCT.as_ref() {
//             let mut channel = my_boxed_session.open_session.channel_session().unwrap();
//             let command: String = format!("yes \"{password}\" $EXECUTE tx bank send {wallet_name} {receiver_address} {amount}$DENOM -y");
//             channel.exec(&command).unwrap();
//             let mut s = String::new();
//             channel.read_to_string(&mut s).unwrap();
//             println!("{}", s);
//             channel.close().unwrap();
//         }
//     }
// }

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            app.get_window("main")
                .unwrap()
                .set_min_size(Some(LogicalSize::new(1280, 720)))
                .unwrap();
            app.get_window("main").unwrap().center().unwrap();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            log_in,
            log_out,
            cpu_mem_sync,
            cpu_mem_sync_stop,
            node_info,
            install_node,
            // unjail,
            create_wallet,
            show_wallets,
            delete_wallet,
            start_stop_restart_node,
            // systemctl_statusnode,
            delete_node,
            // update_node,
            update_wallet_password,
            // send_token,
            recover_wallet,
            // vote,
            if_wallet_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
