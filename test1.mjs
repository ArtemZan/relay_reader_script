
function handleRFIDRead(tag) {
    print("Scan card: ", tag);
}


function init() {
    var rfidStatus = RFIDScanner.start(handleRFIDRead);
    print("RFID status: ", rfidStatus);
}


Timer.set(10000, false, init);