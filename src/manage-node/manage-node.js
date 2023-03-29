const { invoke } = window.__TAURI__.tauri;
const { writeText } = window.__TAURI__.clipboard;
const { message, ask } = window.__TAURI__.dialog;

const ipAddresses = localStorage.getItem("ipaddresses") ? JSON.parse(localStorage.getItem("ipaddresses")) : [];
const notifications = localStorage.getItem("notifications") ? JSON.parse(localStorage.getItem("notifications")) : [];

function changePage(page) {
  fetch(page)
    .then(response => response.text())
    .then(html => {
      document.getElementById('content-of-page').innerHTML = html;
      currentPage = page.split("/")[1].split(".")[0];
      if (currentPage == "wallets") {
        document.querySelectorAll(".each-mnemonic-input-field")[0].addEventListener("paste", function () {
          setTimeout(() => {
            if (this.value.split(" ").length == 24) {
              mnemo = this.value.split(" ");
              document.querySelectorAll(".each-mnemonic-input-field").forEach((element, index) => {
                element.value = mnemo[index];
              });
            }
          }, 100);
        });
      }
    })
    .catch(err => console.log(err));
}

function updateCpuMemSync(cpu, mem, active, sync, catchup, version) {
  if (typeof catchup == "undefined") {
    charts_to_update[0].options.barColor = "#FF2632";
    charts_to_update[0].update(100);
    document.querySelectorAll('.each-page-chart-percentage')[0].textContent = "!";
    document.querySelectorAll('.each-page-chart-text-pop-up')[0].innerText = `Node has stopped!`;
  } else if (!catchup) {
    charts_to_update[0].options.barColor = "#43BE66";
    charts_to_update[0].update(100);
    document.querySelectorAll('.each-page-chart-percentage')[0].textContent = (sync);
    document.querySelectorAll('.each-page-chart-text-pop-up')[0].innerText = `Synced!\n\nCurrent Block:\n${sync}`;
  } else {
    console.log("node is syncing");
    charts_to_update[0].options.barColor = "#0F62FE";
    (async () => {
      await new Promise(resolve => setTimeout(resolve, 2300));
      charts_to_update[0].update(100);
      await new Promise(resolve => setTimeout(resolve, 2300));
      charts_to_update[0].update(0);
    })();
    document.querySelectorAll('.each-page-chart-percentage')[0].textContent = sync;
    document.querySelectorAll('.each-page-chart-text-pop-up')[0].innerText = `Syncing...\n\nCurrent Block:\n${sync}`;
  }
  charts_to_update[1].update(Math.floor(mem));
  document.querySelectorAll('.each-page-chart-percentage')[1].textContent = Math.floor(mem) + "%";

  if (cpu < 100) {
    charts_to_update[2].update(Math.floor(cpu));
    document.querySelectorAll('.each-page-chart-percentage')[2].textContent = Math.floor(cpu) + "%";
  }

  if (active == "active") {
    document.querySelectorAll(".each-sidebar-tag")[0].classList.remove("inactive-tag");
    document.querySelectorAll(".each-sidebar-tag")[0].classList.add("active-tag");
    document.querySelectorAll(".each-sidebar-tag")[0].textContent = "Active";
  } else {
    document.querySelectorAll(".each-sidebar-tag")[0].classList.add("inactive-tag");
    document.querySelectorAll(".each-sidebar-tag")[0].classList.remove("active-tag");
    document.querySelectorAll(".each-sidebar-tag")[0].textContent = active.charAt(0).toUpperCase() + active.slice(1);
  }

  if (typeof version !== "undefined") {
    document.querySelectorAll(".each-sidebar-tag")[1].textContent = "Version " + version;
    document.querySelectorAll(".each-sidebar-tag")[1].classList.add("version-tag");
  }
}

function updateNodeInfo(obj) {
  if (obj == null) {
    message("Node is not running.", { title: "Error", type: "error" });
    hideLoadingAnimation();
    return;
  }
  changePage('page-content/node-information.html');

  setTimeout(() => {
    let fields = document.querySelectorAll(".each-output-field");
    fields[0].textContent = obj.NodeInfo.protocol_version.p2p;
    fields[1].textContent = obj.NodeInfo.protocol_version.block;
    fields[2].textContent = obj.NodeInfo.protocol_version.app;
    fields[3].textContent = obj.NodeInfo.id;
    fields[4].textContent = obj.NodeInfo.listen_addr;
    fields[5].textContent = obj.NodeInfo.network;
    fields[6].textContent = obj.NodeInfo.version;
    fields[7].textContent = obj.NodeInfo.channels;
    fields[8].textContent = obj.NodeInfo.moniker;
    fields[9].textContent = obj.NodeInfo.other.tx_index;
    fields[10].textContent = obj.NodeInfo.other.rpc_address;
    fields[11].textContent = obj.SyncInfo.latest_block_hash;
    fields[12].textContent = obj.SyncInfo.latest_app_hash;
    fields[13].textContent = obj.SyncInfo.latest_block_height;
    fields[14].textContent = obj.SyncInfo.latest_block_time;
    fields[15].textContent = obj.SyncInfo.earliest_block_hash;
    fields[16].textContent = obj.SyncInfo.earliest_app_hash;
    fields[17].textContent = obj.SyncInfo.earliest_block_height;
    fields[18].textContent = obj.SyncInfo.earliest_block_time;
    fields[19].textContent = obj.SyncInfo.catching_up;
    // fields[20].textContent = obj.ValidatorInfo.Address;
    // fields[21].textContent = obj.ValidatorInfo.PubKey.type;
    // fields[22].textContent = obj.ValidatorInfo.PubKey.value;
    // fields[23].textContent = obj.ValidatorInfo.VotingPower;
    hideLoadingAnimation();
  }, 200);
}

function showCreatedWallet(mnemonic) {
  message(mnemonic.slice(1, -1), { title: "Keep your mnemonic private and secure. It's the only way to acces your wallet.", type: "info" });
  document.querySelectorAll(".each-input-field")[0].value = "";

  invoke("show_wallets");
}

function showWallets(list) {
  let walletList = document.getElementById("page-wallet-list");
  walletList.innerHTML = "";

  let adet = list.length;
  if (list.length == 0) {
    walletList.innerHTML = "No wallets found.";
  }
  while (adet > 0) {
    row = document.createElement("div");
    row.setAttribute("class", "each-row");

    if (adet == 1) {
      tekrar = 1;
    } else {
      tekrar = 2;
    }
    for (let i = 0; i < tekrar; i++) {
      halfrow = document.createElement("div");
      halfrow.setAttribute("class", "each-row-half");

      label = document.createElement("div");
      label.setAttribute("class", "each-input-label");
      label.textContent = list[adet - i - 1].name;

      outputgroup = document.createElement("div");
      outputgroup.setAttribute("class", "each-output-group");

      outputfield = document.createElement("div");
      outputfield.setAttribute("class", "each-output-field");
      outputfield.textContent = list[adet - i - 1].address.substring(0, 4) + "..." + list[adet - i - 1].address.substring(list[adet - i - 1].address.length - 4);
      outputfield.setAttribute("title", list[adet - i - 1].address);

      outputfieldiconcopy = document.createElementNS('http://www.w3.org/2000/svg', "svg");
      outputfieldiconcopy.setAttribute("class", "each-output-field-icon-copy");
      outputfieldiconcopy.setAttribute("viewBox", "0 0 17 16");
      outputfieldiconcopy.addEventListener("click", function () {
        writeText(this.previousSibling.title);
        message("Copied to clipboard.", { title: "Success", type: "success" });
      });

      path1 = document.createElementNS('http://www.w3.org/2000/svg', `path`);
      path1.setAttribute("d", "M14.0555 7.35L11.0055 4.3C10.8555 4.1 10.6055 4 10.3555 4H6.35547C5.80547 4 5.35547 4.45 5.35547 5V14C5.35547 14.55 5.80547 15 6.35547 15H13.3555C13.9055 15 14.3555 14.55 14.3555 14V8.05C14.3555 7.8 14.2555 7.55 14.0555 7.35ZM10.3555 5L13.3055 8H10.3555V5ZM6.35547 14V5H9.35547V8C9.35547 8.55 9.80547 9 10.3555 9H13.3555V14H6.35547Z M3.35547 9H2.35547V2C2.35547 1.45 2.80547 1 3.35547 1H10.3555V2H3.35547V9Z");

      outputfieldicondelete = document.createElementNS('http://www.w3.org/2000/svg', "svg");
      outputfieldicondelete.setAttribute("class", "each-output-field-icon-delete");
      outputfieldicondelete.setAttribute("viewBox", "0 0 17 16");
      outputfieldicondelete.addEventListener("click", async function () {
        if (await ask('This action cannot be reverted. Are you sure?', { title: 'Delete Wallet', type: 'warning' })) {
          showLoadingAnimation();
          invoke("delete_wallet", { walletname: this.parentNode.previousSibling.textContent }).then(() => {
            invoke("show_wallets").then(() => {
              hideLoadingAnimation();
            });
          });
        }
      });

      path2 = document.createElementNS('http://www.w3.org/2000/svg', `path`);
      path2.setAttribute("d", "M7.35547 6H6.35547V12H7.35547V6Z M10.3555 6H9.35547V12H10.3555V6Z M2.35547 3V4H3.35547V14C3.35547 14.2652 3.46083 14.5196 3.64836 14.7071C3.8359 14.8946 4.09025 15 4.35547 15H12.3555C12.6207 15 12.875 14.8946 13.0626 14.7071C13.2501 14.5196 13.3555 14.2652 13.3555 14V4H14.3555V3H2.35547ZM4.35547 14V4H12.3555V14H4.35547Z M10.3555 1H6.35547V2H10.3555V1Z");

      outputfieldiconcopy.appendChild(path1);
      outputfieldicondelete.appendChild(path2);
      outputgroup.appendChild(outputfield);
      outputgroup.appendChild(outputfieldiconcopy);
      outputgroup.appendChild(outputfieldicondelete);
      halfrow.appendChild(label);
      halfrow.appendChild(outputgroup);
      row.appendChild(halfrow);
    }
    walletList.appendChild(row);
    adet = adet - 2;
  }
  hideLoadingAnimation();
}

function showLoadingAnimation() {
  scrollTop = window.scrollY;
  document.querySelector(".all-wrapper").style.setProperty("pointer-events", "none");
  document.querySelector(".all-wrapper").style.setProperty("display", "none");
  document.querySelector(".boxes").style.setProperty("display", "unset");
}
function hideLoadingAnimation() {
  document.querySelector(".boxes").style.setProperty("display", "none");
  document.querySelector(".all-wrapper").style.removeProperty("display");
  document.querySelector(".all-wrapper").style.removeProperty("pointer-events");
  window.scrollTo(0, scrollTop);
}

function endInstallation() {
  document.querySelectorAll(".each-progress-bar-status-icon")[0].setAttribute("style", "display: unset;")
  document.querySelector(".progress-bar").setAttribute("value", "100");
  document.querySelector(".progress-bar-text-right").textContent = `100%`;
  invoke("cpu_mem_sync");
}

window.addEventListener('DOMContentLoaded', () => {
  charts_to_update = [];
  document.querySelectorAll('.each-page-chart').forEach((element) => {
    charts_to_update.push(new EasyPieChart(element, {
      size: 160,
      barColor: "rgba(15, 98, 254, 1)",
      scaleLength: 0,
      lineWidth: 6,
      trackColor: "#373737",
      lineCap: "circle",
      animate: 2000,
    }))
  });

  if (localStorage.getItem("installation") == "true") {
    localStorage.setItem("installation", "false");
    localStorage.setItem("ipaddresses", JSON.stringify(ipAddresses.map((ip) => {
      return ip.ip === localStorage.getItem("ip") ? { ...ip, icon: localStorage.getItem("project") } : ip;
    })));
    invoke("install_node");
    changePage('page-content/installation.html');
    setTimeout(() => {
      for (let i = 0; i < 100; i++) {
        setTimeout(() => {
          document.querySelector(".progress-bar").setAttribute("value", i);
          document.querySelector(".progress-bar-text-right").textContent = `${i}%`;
        }, i * i / 0.015);
      }
    }, 1000);
  } else {
    changePage('page-content/node-operations.html');
    invoke("cpu_mem_sync");
  }

  const sidebarNodeIcon = document.querySelector(".sidebar-info-icon");
  const validatorAddress = document.querySelector(".sidebar-info-details-copy");
  const validatorAddressName = document.querySelector(".sidebar-info-details-name");
  const validatorAddressText = document.querySelector(".sidebar-info-details-copy-address");
  const validatorOperationsButton = document.getElementById("validator-operations-button");
  const validatorOperationsArrow = document.querySelector(".each-dropdown-button-arrow");
  const nodeInformationButton = document.getElementById("node-information-button");
  const subButtonsDiv = document.querySelector(".sidebar-dropdown-subbuttons");
  const homePageButton = document.getElementById("home-page-button");
  const nodeOperationsButton = document.getElementById("node-operations-button");
  const createValidatorButton = document.getElementById("create-validator-button");
  const editValidatorButton = document.getElementById("edit-validator-button");
  const withdrawRewardsButton = document.getElementById("withdraw-rewards-button");
  const unjailButton = document.getElementById("unjail-button");
  const delegateTokenButton = document.getElementById("delegate-token-button");
  const sendTokenButton = document.getElementById("send-token-button");
  const redelegateTokenButton = document.getElementById("redelegate-token-button");
  const voteButton = document.getElementById("vote-button");
  const walletsButton = document.getElementById("wallets-button");
  const nodeIcon = document.querySelector(".header-node-icon");
  const nodeIcons = document.querySelector(".header-node-icons");
  const headerMenu = document.querySelector(".header-menu");
  const headerMenuIpButton = document.querySelector(".header-menu-ip-list-button");
  const headerMenuIpButtonIcon = document.querySelector(".header-menu-ip-list-button-icon");
  const notificationsButton = document.getElementById("notifications-button");
  const logoutButton = document.getElementById("logout-button");
  const submenuIpList = document.querySelector(".header-submenu-ip-list");
  const scrollbarBackground = document.querySelector(".header-menu-scroll-background");
  const submenuNotifications = document.querySelector(".header-submenu-notifications");

  validatorAddressName.textContent = localStorage.getItem("project");
  sidebarNodeIcon.setAttribute("src", `../assets/projects/${localStorage.getItem("project").toLowerCase().replace(" ", "-")}.png`);
  nodeIcon.setAttribute("src", `../assets/projects/${localStorage.getItem("project").toLowerCase().replace(" ", "-")}.png`);
  headerMenuIpButtonIcon.setAttribute("src", `../assets/projects/${localStorage.getItem("project").toLowerCase().replace(" ", "-")}.png`);

  for (let i = 0; i < ipAddresses.length; i++) {
    ipListItem = document.createElement("div");
    ipListItem.setAttribute("class", "each-header-submenu-ip-list-item");
    ipListItemIcon = document.createElement("img");
    ipListItemIcon.setAttribute("src", `../assets/projects/${ipAddresses[i].icon.toLowerCase().replace(" ", "-")}.png`);
    ipListItemIcon.setAttribute("class", "each-header-submenu-ip-list-item-icon");
    ipListItemName = document.createElement("div");
    ipListItemName.setAttribute("class", "each-header-submenu-ip-list-item-name");
    ipListItemName.innerText = ipAddresses[i].icon == "" ? "Empty Server" : ipAddresses[i].icon;
    ipListItemIp = document.createElement("div");
    ipListItemIp.setAttribute("class", "each-header-submenu-ip-list-item-ip");
    ipListItemIp.innerText = ipAddresses[i].ip;
    ipAddresses[i].icon == "" ? ipListItemIcon.setAttribute("style", "display: none;") : ipListItem.appendChild(ipListItemIcon);
    ipListItem.appendChild(ipListItemName);
    ipListItem.appendChild(ipListItemIp);
    submenuIpList.appendChild(ipListItem);
  }

  validatorAddress.addEventListener('click', function () {
    writeText(validatorAddressText.innerText);
    message("Copied to clipboard.", { title: "Success", type: "success" });
  })
  homePageButton.addEventListener('click', function () {
    showLoadingAnimation();
    invoke("cpu_mem_sync_stop");
    setTimeout(() => {
      window.location.href = "../home-page/home-page.html";
    }, 5000);
  });
  nodeOperationsButton.addEventListener('click', function () {
    changePage('page-content/node-operations.html');
  });
  createValidatorButton.addEventListener('click', function () {
    changePage('page-content/create-validator.html');
  });
  editValidatorButton.addEventListener('click', function () {
    changePage('page-content/edit-validator.html');
  });
  withdrawRewardsButton.addEventListener('click', function () {
    changePage('page-content/withdraw-rewards.html');
  });
  unjailButton.addEventListener('click', function () {
    changePage('page-content/unjail.html');
  });
  delegateTokenButton.addEventListener('click', function () {
    changePage('page-content/delegate-token.html');
  });
  sendTokenButton.addEventListener('click', function () {
    changePage('page-content/send-token.html');
  });
  redelegateTokenButton.addEventListener('click', function () {
    changePage('page-content/redelegate-token.html');
  });
  voteButton.addEventListener('click', function () {
    changePage('page-content/vote.html');
  });
  walletsButton.addEventListener('click', function () {
    changePage('page-content/wallets-login.html')
  });
  validatorOperationsButton.addEventListener('click', function () {
    if (window.getComputedStyle(subButtonsDiv).getPropertyValue("display") == "none") {
      subButtonsDiv.setAttribute("style", "display: block");
      validatorOperationsArrow.setAttribute("style", "transform: rotate(-180deg); transition: 0.5s;");
    }
    else {
      validatorOperationsArrow.setAttribute("style", "transform: rotate(0); transition: 0.5s;");
      subButtonsDiv.setAttribute("style", "display: none");
    }
  })
  nodeInformationButton.addEventListener('click', function () {
    showLoadingAnimation();
    invoke("node_info");
  });

  window.addEventListener("click", async (e) => {
    if (nodeIcons.contains(e.target)) {
      if (headerMenu.style.display == "block") {
        headerMenu.setAttribute("style", "display: none;");
        submenuIpList.setAttribute("style", "display: none;");
        submenuNotifications.setAttribute("style", "display: none;");
        scrollbarBackground.setAttribute("style", "display: none;");
      }
      else {
        headerMenu.setAttribute("style", "display: block;");
      }
    }
    else if (headerMenuIpButton.contains(e.target)) {
      submenuNotifications.setAttribute("style", "display: none;");
      if (submenuIpList.style.display == "block") {
        submenuIpList.setAttribute("style", "display: none;");
        scrollbarBackground.setAttribute("style", "display: none;");
      }
      else {
        submenuIpList.setAttribute("style", "display: block;");
        scrollbarBackground.setAttribute("style", `display: block; height: ${Math.min(ipAddresses.length, 3) * 60}px;`);
      }
    }
    else if (notificationsButton.contains(e.target)) {
      submenuIpList.setAttribute("style", "display: none;");
      submenuNotifications.innerHTML = "";
      notifications = localStorage.getItem("notifications") ? JSON.parse(localStorage.getItem("notifications")) : [];

      for (let i = notifications.length - 1; 0 < i; i--) {
        notificationItem = document.createElement("div");
        notificationItem.setAttribute("class", "each-header-submenu-notifications-item");
        notificationIcon = document.createElement("span");
        notificationIcon.setAttribute("class", `each-notification-icon${notifications[i].unread ? '' : '-seen'}`);
        notificationContent = document.createElement("div");
        notificationContent.setAttribute("class", "each-notification-content");
        notificationContent.innerText = notifications[i].text;
        notificationItem.appendChild(notificationIcon);
        notificationItem.appendChild(notificationContent);
        submenuNotifications.appendChild(notificationItem);
      }
      document.querySelector(".header-node-icon-notification").setAttribute("style", "display: none;");
      document.querySelector(".each-header-menu-item-notification").setAttribute("style", "display: none;");

      localStorage.setItem("notifications", JSON.stringify(notifications.map((notification) => {
        notification.unread = false;
        return notification;
      })));

      if (submenuNotifications.style.display == "block") {
        submenuNotifications.setAttribute("style", "display: none;");
        scrollbarBackground.setAttribute("style", "display: none;");
      }
      else {
        submenuNotifications.setAttribute("style", "display: block;");
        scrollbarBackground.setAttribute("style", `display: block; height: ${Math.min(notifications.length, 6) * 36}px;`);
      }
    }
    else if (logoutButton.contains(e.target)) {
      showLoadingAnimation();
      invoke("cpu_mem_sync_stop");
      setTimeout(() => {
        invoke("log_out");
        hideLoadingAnimation();
        window.location.href = "../index.html";
      }, 5000);
    }
    else {
      headerMenu.setAttribute("style", "display: none;");
      submenuIpList.setAttribute("style", "display: none;");
      scrollbarBackground.setAttribute("style", "display: none;");
      submenuNotifications.setAttribute("style", "display: none;");
    }

    submitButton = e.target.closest(".each-button");
    if (submitButton) {
      if (currentPage == "create-validator") {
        console.log("create validator")
      }
      else if (currentPage == "edit-validator") {
        console.log("edit validator")
      }
      else if (currentPage == "withdraw-rewards") {
        console.log("withdraw rewards")
      }
      else if (currentPage == "delegate-token") {
        console.log("delegate token")
      }
      else if (currentPage == "redelegate-token") {
        console.log("redelegate token")
      }
      else if (currentPage == "vote") {
        console.log("vote")
      }
      else if (currentPage == "unjail") {
        console.log("unjail")
      }
      else if (currentPage == "send-token") {
        console.log("send token")
      }
      else if (currentPage == "wallets-login") {
        showLoadingAnimation();
        invoke("update_wallet_password", { passw: document.querySelectorAll(".each-input-field")[0].value });
        changePage('page-content/wallets.html');
        invoke("show_wallets");
      }
      else if (currentPage == "wallets") {
        if (submitButton.children[0].innerText == "Create") {
          if (await invoke("if_wallet_exists", { walletname: document.querySelectorAll(".each-input-field")[0].value })) {
            if (await ask('This action will override the existing wallet. Are you sure?', { title: 'Override Wallet', type: 'warning' })) {
              showLoadingAnimation();
              invoke('delete_wallet', { walletname: document.querySelectorAll(".each-input-field")[0].value }).then(() => {
                invoke('create_wallet', { walletname: document.querySelectorAll(".each-input-field")[0].value });
              });
            }
          } else {
            showLoadingAnimation();
            invoke('create_wallet', { walletname: document.querySelectorAll(".each-input-field")[0].value });
          }
        }
        else if (submitButton.children[0].innerText == "Recover") {
          if (await invoke("if_wallet_exists", { walletname: document.querySelectorAll(".each-input-field")[1].value })) {
            if (await ask('This action will override the existing wallet. Are you sure?', { title: 'Override Wallet', type: 'warning' })) {
              showLoadingAnimation();
              invoke("delete_wallet", { walletname: document.querySelectorAll(".each-input-field")[1].value }).then(() => {
                mnemonic = "";
                document.querySelectorAll(".each-mnemonic-input-field").forEach((input) => {
                  mnemonic += input.value + " ";
                });
                mnemonic = mnemonic.slice(0, -1);
                console.log(mnemonic);
                invoke("recover_wallet", { walletname: document.querySelectorAll(".each-input-field")[1].value, mnemo: mnemonic });
              });
            }
          } else {
            showLoadingAnimation();
            mnemonic = "";
            document.querySelectorAll(".each-mnemonic-input-field").forEach((input) => {
              mnemonic += input.value + " ";
            });
            mnemonic = mnemonic.slice(0, -1);
            invoke("recover_wallet", { walletname: document.querySelectorAll(".each-input-field")[1].value, mnemo: mnemonic });
          }
        }
      }
    }

    if (document.querySelector(".page-manage-node-buttons") && document.querySelector(".page-manage-node-buttons").contains(e.target)) {
      if (document.querySelectorAll(".each-page-manage-node-button")[0].contains(e.target)) {
        invoke("start_stop_restart_node", { action: "start" });
      }
      else if (document.querySelectorAll(".each-page-manage-node-button")[1].contains(e.target)) {
        invoke("start_stop_restart_node", { action: "stop" });
      }
      else if (document.querySelectorAll(".each-page-manage-node-button")[2].contains(e.target)) {
        invoke("start_stop_restart_node", { action: "restart" });
      }
      else if (document.querySelectorAll(".each-page-manage-node-button")[3].contains(e.target)) {
        // UPDATE NODE
        console.log("update_node function is called i guess.");
        invoke("update_node")
          .then((res) => {
            console.log(res);
          })
          .catch((e) => {
            console.log(e);
          });
      }
      else if (document.querySelector(".delete-node-button").contains(e.target)) {
        if (await ask('This action cannot be reverted. Are you sure?', { title: 'Delete Node', type: 'warning' })) {
          showLoadingAnimation();
          invoke("delete_node").then(() => {
            invoke("cpu_mem_sync_stop");
            localStorage.setItem("project", "");
            localStorage.setItem("ipaddresses", JSON.stringify(ipAddresses.map((ip) => {
              return ip.ip === localStorage.getItem("ip") ? { ...ip, icon: "" } : ip;
            })));
            setTimeout(() => {
              message("Node deleted successfully.", { title: 'Success', type: 'success' });
              window.location.href = "../home-page/home-page.html";
            }, 5000);
          });
        }
      }
    }
  });
});