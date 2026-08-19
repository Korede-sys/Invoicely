import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Download, MoreHorizontal, Pencil, Printer, Send, Trash2, Wallet } from 'lucide-react'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { deleteInvoice, fetchInvoice, recordPayment } from '../lib/data'
import { amountPaid, deriveStatus, formatMoney, invoiceSubtotal, invoiceTotal, type Invoice } from