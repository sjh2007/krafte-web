const trialDialog=document.querySelector('#plan-dialog');
document.querySelector('#start-trial').addEventListener('click',()=>trialDialog.showModal());
trialDialog.querySelector('.dialog-close').addEventListener('click',()=>trialDialog.close());
