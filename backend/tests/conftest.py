import os
import tempfile

# Doit être défini avant l'import de app.main (réglages lus à l'import)
os.environ["NOVA_DEMO"] = "true"
os.environ["NOVA_DATA_DIR"] = tempfile.mkdtemp(prefix="novapanel-test-")
