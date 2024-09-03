import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog
from PyPDF2 import PdfReader, PdfWriter
import os
# import pycryptodome

def merge_pdfs(pdf_list, output_path):
    pdf_writer = PdfWriter()
    
    for pdf in pdf_list:
        pdf_reader = PdfReader(pdf)
        
        # 암호화된 PDF 처리
        if pdf_reader.is_encrypted:
            password = simpledialog.askstring("Password", f"Enter password for {os.path.basename(pdf)}:")
            if password:
                pdf_reader.decrypt(password)
            else:
                messagebox.showwarning("Warning", f"Cannot decrypt {os.path.basename(pdf)} without password.")
                continue
        
        for page_num in range(len(pdf_reader.pages)):
            page = pdf_reader.pages[page_num]
            pdf_writer.add_page(page)
    
    with open(output_path, 'wb') as output_pdf:
        pdf_writer.write(output_pdf)
        
    messagebox.showinfo("Success", f"PDFs merged successfully into {output_path}")

def select_files():
    files = filedialog.askopenfilenames(filetypes=[("PDF files", "*.pdf")])
    if files:
        for file in files:
            pdf_listbox.insert(tk.END, file)

def remove_selected():
    selected_items = pdf_listbox.curselection()
    for index in reversed(selected_items):
        pdf_listbox.delete(index)

def move_up():
    selected_items = pdf_listbox.curselection()
    for index in selected_items:
        if index > 0:
            pdf_listbox.insert(index-1, pdf_listbox.get(index))
            pdf_listbox.delete(index+1)
            pdf_listbox.selection_set(index-1)

def move_down():
    selected_items = pdf_listbox.curselection()
    for index in reversed(selected_items):
        if index < pdf_listbox.size() - 1:
            pdf_listbox.insert(index+1, pdf_listbox.get(index))
            pdf_listbox.delete(index)
            pdf_listbox.selection_set(index+1)

def merge_files():
    pdf_files = pdf_listbox.get(0, tk.END)
    if not pdf_files:
        messagebox.showwarning("Warning", "Please select at least two PDF files.")
        return
    
    output_name = simpledialog.askstring("Output File Name", "Enter output file name (without extension):")
    if not output_name:
        return
    
    output_path = filedialog.askdirectory(title="Select Output Directory")
    if not output_path:
        return
    
    output_file = os.path.join(output_path, f"{output_name}.pdf")
    merge_pdfs(pdf_files, output_file)

# GUI 설정
root = tk.Tk()
root.title("PDF Merger")

# 파일 선택 버튼
select_button = tk.Button(root, text="Select PDFs", command=select_files)
select_button.pack(pady=5)

# 리스트박스 설정
pdf_listbox = tk.Listbox(root, selectmode=tk.MULTIPLE, width=60, height=15)
pdf_listbox.pack(padx=10, pady=10)

# 파일 삭제 버튼
remove_button = tk.Button(root, text="Remove Selected", command=remove_selected)
remove_button.pack(pady=5)

# 순서 조정 버튼
up_button = tk.Button(root, text="Move Up", command=move_up)
up_button.pack(pady=5)

down_button = tk.Button(root, text="Move Down", command=move_down)
down_button.pack(pady=5)

# 병합 버튼
merge_button = tk.Button(root, text="Merge PDFs", command=merge_files)
merge_button.pack(pady=10)

# 프로그램 실행
root.mainloop()
