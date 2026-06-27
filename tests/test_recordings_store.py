from call_management.recordings.store import recording_api_url, save_recording_bytes, find_recording_file


def test_save_and_find_recording(tmp_path, monkeypatch):
    monkeypatch.setenv("RECORDINGS_DIR", str(tmp_path))
    from call_management.recordings import store as mod

    monkeypatch.setattr(mod, "RECORDINGS_ROOT", tmp_path)

    save_recording_bytes("tenant_a", "call_test_1", b"fake-audio", ext="webm")
    found = find_recording_file("tenant_a", "call_test_1")
    assert found is not None
    assert found.read_bytes() == b"fake-audio"
    assert recording_api_url("call_test_1") == "/api/calls/call_test_1/recording"