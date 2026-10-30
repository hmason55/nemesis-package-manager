package dev.nemesis.usbmanager;

import java.io.IOException;
import java.net.InetAddress;
import java.net.Socket;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/** Enable KitKat's supported TLS 1.2; keep the platform trust and hostname checks. */
final class Tls12SocketFactory extends SSLSocketFactory {
    private final SSLSocketFactory delegate;
    Tls12SocketFactory(SSLSocketFactory delegate) { this.delegate = delegate; }
    private Socket configure(Socket socket) {
        if (socket instanceof SSLSocket) ((SSLSocket) socket).setEnabledProtocols(new String[] { "TLSv1.2" });
        return socket;
    }
    public String[] getDefaultCipherSuites() { return delegate.getDefaultCipherSuites(); }
    public String[] getSupportedCipherSuites() { return delegate.getSupportedCipherSuites(); }
    public Socket createSocket(Socket s, String host, int port, boolean close) throws IOException { return configure(delegate.createSocket(s, host, port, close)); }
    public Socket createSocket(String host, int port) throws IOException { return configure(delegate.createSocket(host, port)); }
    public Socket createSocket(String host, int port, InetAddress local, int localPort) throws IOException { return configure(delegate.createSocket(host, port, local, localPort)); }
    public Socket createSocket(InetAddress host, int port) throws IOException { return configure(delegate.createSocket(host, port)); }
    public Socket createSocket(InetAddress host, int port, InetAddress local, int localPort) throws IOException { return configure(delegate.createSocket(host, port, local, localPort)); }
}
