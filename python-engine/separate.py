import sys
import shutil
import time

input_file = sys.argv[1]
output_file = sys.argv[2]

print("Procesando...")
time.sleep(5)

# Simulación: copia archivo original
shutil.copy(input_file, output_file)

print("Listo")