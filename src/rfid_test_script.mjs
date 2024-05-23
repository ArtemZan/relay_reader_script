function handleRFIDRead(tag) {
    print("Scan card: ", tag);
}

print("Hello!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")

RFIDScanner.start(handleRFIDRead);